import { assocIn, updateIn } from "icepick";
import { normalize } from "normalizr";
import { useMemo } from "react";
import { t } from "ttag";

import {
  fieldApi,
  skipToken,
  useGetFieldQuery,
  useGetFieldValuesQuery,
} from "metabase/api";
import {
  createEntity,
  entityCompatibleQuery,
  notify,
} from "metabase/lib/entities";
import {
  compose,
  createAction,
  createThunkAction,
  handleActions,
  updateData,
  withAction,
  withCachedDataAndRequestState,
  withNormalize,
} from "metabase/lib/redux";
import { FieldSchema } from "metabase/schema";
import {
  getMetadata,
  getMetadataUnfiltered,
} from "metabase/selectors/metadata";
import { getUniqueFieldId } from "metabase-lib/v1/metadata/utils/fields";
import { getFieldValues } from "metabase-lib/v1/queries/utils/field";

// ADDITIONAL OBJECT ACTIONS

export const FETCH_FIELD_VALUES = "metabase/entities/fields/FETCH_FIELD_VALUES";
export const UPDATE_FIELD_VALUES =
  "metabase/entities/fields/UPDATE_FIELD_VALUES";
export const DELETE_FIELD_DIMENSION =
  "metabase/metadata/DELETE_FIELD_DIMENSION";
export const UPDATE_FIELD_DIMENSION =
  "metabase/metadata/UPDATE_FIELD_DIMENSION";
export const ADD_REMAPPINGS = "metabase/entities/fields/ADD_REMAPPINGS";

// ADDITIONAL OTHER ACTIONS

export const ADD_PARAM_VALUES = "metabase/entities/fields/ADD_PARAM_VALUES";
export const ADD_FIELDS = "metabase/entities/fields/ADD_FIELDS";

/**
 * @deprecated use "metabase/api" instead
 */
const Fields = createEntity({
  name: "fields",
  path: "/api/field",
  schema: FieldSchema,

  rtk: {
    getUseGetQuery: (fetchType) => {
      if (fetchType === "fetchFieldValues") {
        return {
          useGetQuery: useGetFetchFieldValuesQuery,
        };
      }

      return {
        useGetQuery: useGetFieldQuery,
      };
    },
  },

  api: {
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(entityQuery, dispatch, fieldApi.endpoints.getField),
    update: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        fieldApi.endpoints.updateField,
      ),
  },

  selectors: {
    getObject: (state, { entityId }) => getMetadata(state).field(entityId),

    // getMetadata filters out sensitive fields by default.
    // This selector is used in the data model when we want to show them.
    getObjectUnfiltered: (state, { entityId }) =>
      getMetadataUnfiltered(state).field(entityId),
    getFieldValues: (state, { entityId }) => {
      const field = state.entities.fields[entityId];
      return field ? getFieldValues(field) : [];
    },
  },

  // ACTION CREATORS

  objectActions: {
    fetchFieldValues: compose(
      withAction(FETCH_FIELD_VALUES),
      withCachedDataAndRequestState(
        ({ id, table_id }) => {
          const uniqueId = getUniqueFieldId({ id, table_id });
          return [...Fields.getObjectStatePath(uniqueId)];
        },
        ({ id, table_id }) => {
          const uniqueId = getUniqueFieldId({ id, table_id });
          return [...Fields.getObjectStatePath(uniqueId), "values"];
        },
        (field) => {
          return Fields.getQueryKey({ id: field.id });
        },
      ),
      withNormalize(FieldSchema),
    )((field) => async (dispatch) => {
      const { field_id, ...data } = await entityCompatibleQuery(
        field.id,
        dispatch,
        fieldApi.endpoints.getFieldValues,
      );
      const table_id = field.table_id;

      // table_id is required for uniqueFieldId as it's a way to know if field is virtual
      return { id: field_id, ...data, ...(table_id && { table_id }) };
    }),

    updateField(field, values, opts) {
      return async (dispatch, getState) => {
        const result = await dispatch(
          Fields.actions.update(
            { id: field.id },
            values,
            notify(opts, field.displayName(), t`updated`),
          ),
        );

        // field values needs to be fetched again once the field is updated metabase#16322
        await dispatch(
          Fields.actions.fetchFieldValues(field, { reload: true }),
        );

        return result;
      };
    },
    // Docstring from m.api.field:
    // Update the human-readable values for a `Field` whose semantic type is
    // `category`/`city`/`state`/`country` or whose base type is `type/Boolean`."
    updateFieldValues: createThunkAction(
      UPDATE_FIELD_VALUES,
      ({ id }, fieldValuePairs) =>
        (dispatch, getState) =>
          updateData({
            dispatch,
            getState,
            requestStatePath: ["entities", "fields", id, "dimension"],
            existingStatePath: ["entities", "fields", id],
            putData: () =>
              entityCompatibleQuery(
                {
                  id,
                  values: fieldValuePairs,
                },
                dispatch,
                fieldApi.endpoints.updateFieldValues,
              ),
          }),
    ),
    updateFieldDimension: createThunkAction(
      UPDATE_FIELD_DIMENSION,
      ({ id }, dimension) =>
        (dispatch) =>
          entityCompatibleQuery(
            { id, ...dimension },
            dispatch,
            fieldApi.endpoints.createFieldDimension,
          ),
    ),
    deleteFieldDimension: createThunkAction(
      DELETE_FIELD_DIMENSION,
      ({ id }) =>
        async (dispatch) => {
          await entityCompatibleQuery(
            id,
            dispatch,
            fieldApi.endpoints.deleteFieldDimension,
          );
          return { id };
        },
    ),

    addRemappings: createAction(ADD_REMAPPINGS, ({ id }, remappings) => ({
      fieldId: id,
      remappings,
    })),
  },

  actions: {
    addParamValues: createAction(ADD_PARAM_VALUES),
    addFields: createAction(ADD_FIELDS, (fields) =>
      normalize(fields, [FieldSchema]),
    ),
  },

  // ADDITIONAL REDUCER

  reducer: handleActions(
    {
      [ADD_PARAM_VALUES]: {
        next: (state, { payload: paramValues }) => {
          for (const fieldValues of Object.values(paramValues)) {
            state = assocIn(
              state,
              [fieldValues.field_id, "values"],
              fieldValues,
            );
          }
          return state;
        },
      },
      [ADD_REMAPPINGS]: (state, { payload: { fieldId, remappings } }) =>
        updateIn(state, [fieldId, "remappings"], (existing = []) =>
          Array.from(new Map(existing.concat(remappings))),
        ),
      // cannot use `UPDATE_TABLE_FIELD_ORDER` because of the dependency cycle
      ["metabase/entities/UPDATE_TABLE_FIELD_ORDER"]: (
        state,
        { payload: { fieldOrder } },
      ) => {
        fieldOrder.forEach((fieldId, index) => {
          state = assocIn(state, [fieldId, "position"], index);
        });

        return state;
      },
      [UPDATE_FIELD_DIMENSION]: (state, { payload: dimension }) =>
        assocIn(state, [dimension.field_id, "dimensions"], [dimension]),
      [DELETE_FIELD_DIMENSION]: (state, { payload: { id } }) =>
        assocIn(state, [id, "dimensions"], []),
    },
    {},
  ),
});

const useGetFetchFieldValuesQuery = (query, options) => {
  const tableId = query.table_id;
  const result = useGetFieldValuesQuery(
    query === skipToken ? skipToken : query.id,
    options,
  );

  const { data } = result;
  const transformedData = useMemo(() => {
    return data ? transformFieldValuesData(data, tableId) : data;
  }, [data, tableId]);

  return useMemo(
    () => ({ ...result, data: transformedData }),
    [result, transformedData],
  );
};

const transformFieldValuesData = (data, table_id) => {
  if (!data) {
    return data;
  }

  const { field_id, ...rest } = data;

  // table_id is required for uniqueFieldId as it's a way to know if field is virtual
  return { id: field_id, ...rest, ...(table_id && { table_id }) };
};

export default Fields;
