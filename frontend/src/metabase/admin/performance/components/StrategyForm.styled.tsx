// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Form } from "metabase/forms";
import { FixedSizeIcon, Group, Loader } from "metabase/ui";

export const LoaderInButton = styled(Loader)`
  position: relative;
  top: 1px;
`;

export const IconInButton = styled(FixedSizeIcon)`
  position: relative;
  top: 1px;
`;

export const FormWrapper = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
`;

export const StyledForm = styled(Form)`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
`;

export const StyledFormButtonsGroup = styled(Group)<{ isInSidebar?: boolean }>`
  padding-block: 1rem;
  gap: 1rem;
  ${({ isInSidebar }) =>
    isInSidebar
      ? `
  justify-content: flex-end;
  padding-inline: 1rem;
  padding-bottom: 0;
  `
      : `
  background-color: var(--mb-color-bg-white);
  border-top: 1px solid var(--mb-color-border);
  padding-inline: 2.5rem;
  `}
`;
