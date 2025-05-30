import type { FormEvent } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { useBooleanOptionFilter } from "metabase/querying/filters/hooks/use-boolean-option-filter";
import { Box, Button, Icon, Radio, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";

import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { WIDTH } from "../constants";
import type { FilterPickerWidgetProps } from "../types";

export function BooleanFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  onBack,
  onChange,
}: FilterPickerWidgetProps) {
  const columnInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const {
    optionType,
    isExpanded,
    visibleOptions,
    getFilterClause,
    setOptionType,
    setIsExpanded,
  } = useBooleanOptionFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  const handleOptionChange = (optionValue: string) => {
    const option = visibleOptions.find(({ type }) => type === optionValue);
    if (option) {
      setOptionType(option.type);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onChange(getFilterClause());
  };

  return (
    <Box
      component="form"
      miw={WIDTH}
      data-testid="boolean-filter-picker"
      onSubmit={handleSubmit}
    >
      {onBack && (
        <FilterPickerHeader
          columnName={columnInfo.longDisplayName}
          onBack={onBack}
        />
      )}
      <div>
        <Radio.Group value={optionType} onChange={handleOptionChange}>
          <Stack p="md" pb={isExpanded ? "md" : 0} gap="sm">
            {visibleOptions.map((option) => (
              <Radio
                key={option.type}
                value={option.type}
                label={option.name}
                pb={6}
                size="xs"
              />
            ))}
          </Stack>
        </Radio.Group>
        {!isExpanded && (
          <Button
            c="text-medium"
            variant="subtle"
            aria-label={t`More options`}
            rightSection={<Icon name="chevrondown" />}
            onClick={() => setIsExpanded(true)}
          >
            {t`More options`}
          </Button>
        )}
        <FilterPickerFooter isNew={isNew} canSubmit />
      </div>
    </Box>
  );
}
