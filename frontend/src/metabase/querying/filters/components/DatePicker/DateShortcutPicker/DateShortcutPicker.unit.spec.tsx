import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import {
  DATE_PICKER_OPERATORS,
  DATE_PICKER_SHORTCUTS,
} from "metabase/querying/filters/constants";
import type {
  DatePickerOperator,
  DatePickerShortcut,
} from "metabase/querying/filters/types";

import { DateShortcutPicker } from "./DateShortcutPicker";

interface SetupOpts {
  availableOperators?: DatePickerOperator[];
  availableShortcuts?: DatePickerShortcut[];
}

function setup({
  availableOperators = DATE_PICKER_OPERATORS,
  availableShortcuts = DATE_PICKER_SHORTCUTS,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onSelectType = jest.fn();

  renderWithProviders(
    <DateShortcutPicker
      availableOperators={availableOperators}
      availableShortcuts={availableShortcuts}
      onChange={onChange}
      onSelectType={onSelectType}
    />,
  );

  return { onChange, onSelectType };
}

describe("DateShortcutPicker", () => {
  it("should be able to create a filter via shortcuts", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByText("Today"));
    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: 0,
      unit: "day",
    });
  });

  it("should be able to navigate to a more specific filter type", async () => {
    const { onSelectType } = setup();
    await userEvent.click(screen.getByText("Fixed date range…"));
    expect(onSelectType).toHaveBeenCalledWith("specific");
  });
});
