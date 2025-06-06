(ns metabase.sso.common
  "Shared functionality used by different integrations."
  (:require
   [clojure.data :as data]
   [clojure.set :as set]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn sync-group-memberships!
  "Update the PermissionsGroups a User belongs to, adding or deleting membership entries as needed so that Users is
  only in `new-groups-or-ids`. Ignores special groups like `all-users`, and only touches groups with mappings set."
  [user-or-id new-groups-or-ids mapped-groups-or-ids]
  (let [mapped-group-ids   (set (map u/the-id mapped-groups-or-ids))
        excluded-group-ids #{(u/the-id (perms/all-users-group))}
        user-id            (u/the-id user-or-id)
        current-group-ids  (when (seq mapped-group-ids)
                             (t2/select-fn-set :group_id :model/PermissionsGroupMembership
                                               {:where
                                                [:and
                                                 [:= :user_id user-id]
                                                 [:in :group_id mapped-group-ids]
                                                 [:not-in :group_id excluded-group-ids]]}))
        new-group-ids      (set/intersection (set (map u/the-id new-groups-or-ids))
                                             mapped-group-ids)
        ;; determine what's different between current mapped groups and new mapped groups
        [to-remove to-add] (data/diff current-group-ids new-group-ids)]
    ;; remove membership from any groups as needed
    (when (seq to-remove)
      (log/debugf "Removing user %s from group(s) %s" user-id to-remove)
      (try
        (t2/delete! :model/PermissionsGroupMembership :group_id [:in to-remove], :user_id user-id)
        (catch clojure.lang.ExceptionInfo e
         ;; in case sync attempts to delete the last admin, the pre-delete hooks of
         ;; [[metabase.permissions.models.permissions-group-membership/PermissionsGroupMembership]] will throw an exception.
         ;; but we don't want to block user from logging-in, so catch this exception and log a warning
          (if (= (ex-message e) (str perms/fail-to-remove-last-admin-msg))
            (log/warn "Attempted to remove the last admin during group sync!"
                      "Check your SSO group mappings and make sure the Administrators group is mapped correctly.")
            (throw e)))))
    ;; add new memberships for any groups as needed
    (doseq [id    to-add
            :when (not (excluded-group-ids id))]
      (log/debugf "Adding user %s to group %s" user-id id)
      ;; if adding membership fails for one reason or another (i.e. if the group doesn't exist) log the error add the
      ;; user to the other groups rather than failing entirely
      (try
        (t2/insert! :model/PermissionsGroupMembership :group_id id, :user_id user-id)
        (catch Throwable e
          (log/errorf e "Error adding User %s to Group %s" user-id id))))))
