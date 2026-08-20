<script setup lang="ts">
import type { ManualPortfolioImportRecord } from '@/api/portfolios';
import { FileDropzone } from '@/components/common/dropzone';
import InputField from '@/components/fields/input-field.vue';
import { FieldLabel, TextareaField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { Card } from '@/components/lib/ui/card';
import { Checkbox } from '@/components/lib/ui/checkbox';
import * as Select from '@/components/lib/ui/select';
import {
  useCreateManualPortfolioTransaction,
  useCreateManualPortfolioValuation,
  useDeleteManualPortfolioTransaction,
  useDeleteManualPortfolioValuation,
  useExecuteManualPortfolioImport,
  useExtractManualPortfolioImport,
  useManualPortfolioValues,
  useUpdateManualPortfolioTransaction,
  useUpdateManualPortfolioValuation,
} from '@/composable/data-queries/manual-portfolio-values';
import { useFormatCurrency } from '@/composable/formatters';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { getApiErrorMessage } from '@/js/errors';
import { MANUAL_PORTFOLIO_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { computed, reactive, ref, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ portfolioId: string }>();
const portfolioId = toRef(props, 'portfolioId');
const values = useManualPortfolioValues(portfolioId);
const createTransaction = useCreateManualPortfolioTransaction();
const createValuation = useCreateManualPortfolioValuation();
const updateTransaction = useUpdateManualPortfolioTransaction();
const updateValuation = useUpdateManualPortfolioValuation();
const deleteTransaction = useDeleteManualPortfolioTransaction();
const deleteValuation = useDeleteManualPortfolioValuation();
const extractImport = useExtractManualPortfolioImport();
const executeImport = useExecuteManualPortfolioImport();
const { t } = useI18n();
const { addNotification } = useNotificationCenter();
const today = new Date().toISOString().slice(0, 10);
const transaction = reactive({
  date: today,
  amount: '',
  category: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.contribution,
  note: '',
});
const valuation = reactive({ date: today, value: '', note: '', source: '' });
const editingTransactionId = ref<string | null>(null);
const editingValuationId = ref<string | null>(null);
const overview = computed(() => values.data.value);
const canSaveTransaction = computed(() =>
  Boolean(transaction.date && transaction.amount !== '' && Number(transaction.amount) > 0),
);
const canSaveValuation = computed(() =>
  Boolean(valuation.date && valuation.value !== '' && Number(valuation.value) >= 0),
);
const isSavingTransaction = computed(() => createTransaction.isPending.value || updateTransaction.isPending.value);
const isSavingValuation = computed(() => createValuation.isPending.value || updateValuation.isPending.value);
const { formatAmountByCurrencyCode } = useFormatCurrency();
const money = (value: string | null | undefined) =>
  value == null || !overview.value ? '—' : formatAmountByCurrencyCode(Number(value), overview.value.currencyCode);

const categoryOptions = computed(() =>
  Object.values(MANUAL_PORTFOLIO_TRANSACTION_CATEGORY).map((value) => ({
    value,
    label: t(`portfolioDetail.manual.categories.${value}`),
  })),
);

const saveTransaction = async () => {
  if (!transaction.amount) return;
  const payload = { portfolioId: props.portfolioId, ...transaction, note: transaction.note || null };
  if (editingTransactionId.value)
    await updateTransaction.mutateAsync({ ...payload, recordId: editingTransactionId.value });
  else await createTransaction.mutateAsync(payload);
  addNotification({ type: NotificationType.success, text: t('portfolioDetail.manual.transactionSaved') });
  editingTransactionId.value = null;
  transaction.amount = '';
  transaction.note = '';
};

const saveValuation = async () => {
  if (valuation.value === '') return;
  const payload = {
    portfolioId: props.portfolioId,
    ...valuation,
    note: valuation.note || null,
    source: valuation.source || null,
  };
  if (editingValuationId.value)
    await updateValuation.mutateAsync({ ...payload, valuationId: editingValuationId.value });
  else await createValuation.mutateAsync(payload);
  addNotification({ type: NotificationType.success, text: t('portfolioDetail.manual.valuationSaved') });
  editingValuationId.value = null;
  valuation.value = '';
  valuation.note = '';
  valuation.source = '';
};

const editEntry = (entry: NonNullable<typeof overview.value>['timeline'][number]) => {
  if (entry.kind === 'linked-transfer') return;
  if (entry.kind === 'valuation') {
    editingValuationId.value = entry.id;
    Object.assign(valuation, {
      date: entry.date,
      value: entry.value,
      note: entry.note || '',
      source: entry.source || '',
    });
  } else {
    editingTransactionId.value = entry.id;
    Object.assign(transaction, {
      date: entry.date,
      amount: entry.amount,
      category: entry.category,
      note: entry.note || '',
    });
  }
};

const removeEntry = async (entry: NonNullable<typeof overview.value>['timeline'][number]) => {
  if (entry.kind === 'linked-transfer' || !window.confirm(t('portfolioDetail.manual.delete'))) return;
  if (entry.kind === 'valuation')
    await deleteValuation.mutateAsync({ portfolioId: props.portfolioId, valuationId: entry.id });
  else await deleteTransaction.mutateAsync({ portfolioId: props.portfolioId, recordId: entry.id });
};

const chartPoints = computed(() => overview.value?.history ?? []);
const chartMaximum = computed(() =>
  Math.max(1, ...chartPoints.value.flatMap((point) => [Number(point.reportedValue), Number(point.investedCapital)])),
);

type ImportMode = 'ai' | 'csv';
type ImportInputMode = 'paste' | 'file';
const importMode = ref<ImportMode>('ai');
const importInputMode = ref<ImportInputMode>('paste');
const importText = ref('');
const importFile = ref<File | null>(null);
const importFileBase64 = ref<string | null>(null);
const importRecords = ref<ManualPortfolioImportRecord[]>([]);
const importWarnings = ref<string[]>([]);
const skipTempIds = ref<string[]>([]);

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

watch(importFile, async (file) => {
  importFileBase64.value = file ? await fileToBase64(file) : null;
});

const importHasInput = computed(() =>
  importInputMode.value === 'paste'
    ? importText.value.trim().length > 0
    : Boolean(importFile.value && importFileBase64.value),
);
const importHasBlockingRecords = computed(() =>
  importRecords.value.some(
    (record) =>
      !record.date || !record.amount || (record.kind === 'transaction' && !record.category) || record.currencyMismatch,
  ),
);

const extractRecords = async () => {
  if (!importHasInput.value) return;
  const result =
    importMode.value === 'csv'
      ? await extractImport.mutateAsync({
          portfolioId: props.portfolioId,
          source: 'csv',
          csv: importInputMode.value === 'paste' ? importText.value : await importFile.value!.text(),
        })
      : await extractImport.mutateAsync({
          portfolioId: props.portfolioId,
          source: 'ai',
          ...(importInputMode.value === 'paste' ? { text: importText.value } : { fileBase64: importFileBase64.value! }),
        });
  importRecords.value = result.records;
  importWarnings.value = result.warnings;
  skipTempIds.value = [];
};

const updateImportCurrency = (record: ManualPortfolioImportRecord, raw: string | number | null) => {
  const currencyCode =
    String(raw ?? '')
      .trim()
      .toUpperCase() || null;
  record.currencyCode = currencyCode;
  record.currencyMismatch = Boolean(currencyCode && overview.value && currencyCode !== overview.value.currencyCode);
};

const toggleSkip = (tempId: string, checked: boolean | 'indeterminate') => {
  const shouldSkip = checked === true;
  skipTempIds.value = shouldSkip
    ? [...new Set([...skipTempIds.value, tempId])]
    : skipTempIds.value.filter((id) => id !== tempId);
};

const executeReviewedImport = async () => {
  if (importHasBlockingRecords.value || !importRecords.value.length) return;
  const result = await executeImport.mutateAsync({
    portfolioId: props.portfolioId,
    records: importRecords.value,
    skipTempIds: skipTempIds.value,
  });
  addNotification({
    type: NotificationType.success,
    text: t('portfolioDetail.manual.importSuccess', result),
  });
  importRecords.value = [];
  importWarnings.value = [];
  importText.value = '';
  importFile.value = null;
};

const discardImport = () => {
  importRecords.value = [];
  importWarnings.value = [];
  importText.value = '';
  importFile.value = null;
  skipTempIds.value = [];
};

const handleImportError = (error: unknown) => {
  addNotification({
    type: NotificationType.error,
    text: getApiErrorMessage({
      e: error,
      t,
      conflictKey: 'portfolioDetail.loadError',
      fallbackKey: 'portfolioDetail.loadError',
    }),
  });
};
</script>

<template>
  <div class="grid gap-6">
    <Card v-if="overview" class="p-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-muted-foreground text-sm">{{ $t('portfolioDetail.manual.derivedValue') }}</p>
          <p class="text-3xl font-semibold">{{ money(overview.currentValue) }}</p>
          <p v-if="overview.currentValue === null" class="text-muted-foreground mt-1 text-xs">
            {{ $t('portfolioDetail.manual.noValuation') }}
          </p>
        </div>
        <p v-if="overview.isStale" class="rounded bg-amber-100 px-3 py-1 text-sm text-amber-900">
          {{ $t('portfolioDetail.manual.stale') }}
        </p>
      </div>
      <div class="mt-5 grid gap-4 border-t pt-5 sm:grid-cols-4">
        <div>
          <p class="text-muted-foreground text-xs">{{ $t('portfolioDetail.manual.lastReported') }}</p>
          <p class="font-medium">{{ money(overview.lastReportedValue) }}</p>
          <p class="text-muted-foreground text-xs">{{ overview.valuationDate || '—' }}</p>
        </div>
        <div>
          <p class="text-muted-foreground text-xs">{{ $t('portfolioDetail.manual.activitySince') }}</p>
          <p class="font-medium">{{ money(overview.netActivitySinceValuation) }}</p>
        </div>
        <div>
          <p class="text-muted-foreground text-xs">{{ $t('portfolioDetail.manual.gain') }}</p>
          <p class="font-medium">
            {{ money(overview.gain) }} <span v-if="overview.gainPercent">({{ overview.gainPercent }}%)</span>
          </p>
        </div>
        <div>
          <p class="text-muted-foreground text-xs">{{ $t('portfolioDetail.manual.contributions') }}</p>
          <p class="font-medium">{{ money(overview.totals.contribution) }}</p>
        </div>
        <div>
          <p class="text-muted-foreground text-xs">{{ $t('portfolioDetail.manual.reportedEstimated') }}</p>
          <p class="font-medium">{{ money(overview.lastReportedValue) }} / {{ money(overview.currentValue) }}</p>
        </div>
      </div>
      <div class="mt-5 grid grid-cols-2 gap-3 border-t pt-5 sm:grid-cols-3 lg:grid-cols-6">
        <div v-for="category in Object.values(MANUAL_PORTFOLIO_TRANSACTION_CATEGORY)" :key="category">
          <p class="text-muted-foreground text-xs">{{ $t(`portfolioDetail.manual.categories.${category}`) }}</p>
          <p class="font-medium">{{ money(overview.totals[category]) }}</p>
        </div>
      </div>
    </Card>

    <Card v-if="chartPoints.length" class="p-5">
      <h2 class="font-semibold">{{ $t('portfolioDetail.manual.valueVsCapital') }}</h2>
      <div class="mt-4 overflow-x-auto">
        <div class="flex min-w-max items-end gap-3" style="height: 9rem">
          <div
            v-for="point in chartPoints"
            :key="point.date"
            class="flex h-full w-24 flex-col justify-end gap-1 text-center text-xs"
          >
            <div
              class="bg-primary/80 rounded"
              :style="{ height: `${Math.max(4, (Number(point.reportedValue) / chartMaximum) * 100)}%` }"
              :title="`${point.date}: ${money(point.reportedValue)}`"
            />
            <div
              class="bg-muted-foreground/35 rounded"
              :style="{ height: `${Math.max(4, (Number(point.investedCapital) / chartMaximum) * 100)}%` }"
              :title="`${point.date}: ${money(point.investedCapital)}`"
            />
            <span>{{ point.date }}</span>
          </div>
        </div>
      </div>
      <p class="text-muted-foreground mt-2 text-xs">
        {{ $t('portfolioDetail.manual.reportedLegend') }} · {{ $t('portfolioDetail.manual.capitalLegend') }}
      </p>
    </Card>

    <Card class="p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="font-semibold">{{ $t('portfolioDetail.manual.import') }}</h2>
          <p class="text-muted-foreground mt-1 text-sm">{{ $t('portfolioDetail.manual.importDescription') }}</p>
        </div>
        <div class="flex gap-2">
          <Button size="sm" :variant="importMode === 'ai' ? 'default' : 'outline'" @click="importMode = 'ai'">{{
            $t('portfolioDetail.manual.aiExtraction')
          }}</Button>
          <Button size="sm" :variant="importMode === 'csv' ? 'default' : 'outline'" @click="importMode = 'csv'">{{
            $t('portfolioDetail.manual.localCsv')
          }}</Button>
        </div>
      </div>
      <div class="mt-4 flex gap-2">
        <Button
          size="sm"
          :variant="importInputMode === 'paste' ? 'secondary' : 'ghost'"
          @click="importInputMode = 'paste'"
          >{{ $t('portfolioDetail.manual.paste') }}</Button
        >
        <Button
          size="sm"
          :variant="importInputMode === 'file' ? 'secondary' : 'ghost'"
          @click="importInputMode = 'file'"
          >{{ $t('portfolioDetail.manual.file') }}</Button
        >
      </div>
      <TextareaField
        v-if="importInputMode === 'paste'"
        v-model="importText"
        class="mt-4"
        :rows="7"
        :placeholder="$t('portfolioDetail.manual.importDescription')"
      />
      <FileDropzone
        v-else
        v-model="importFile"
        class="mt-4"
        accept=".csv,.txt,.pdf,text/csv,text/plain,application/pdf"
        @error="(message) => addNotification({ type: NotificationType.error, text: message })"
      />
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <Button
          :disabled="!importHasInput || extractImport.isPending.value"
          @click="extractRecords().catch(handleImportError)"
        >
          {{ $t(importMode === 'ai' ? 'portfolioDetail.manual.aiExtraction' : 'portfolioDetail.manual.localCsv') }}
        </Button>
        <p class="text-muted-foreground text-xs">{{ $t('portfolioDetail.manual.importContentDiscarded') }}</p>
      </div>

      <div v-if="importWarnings.length" class="mt-4 grid gap-1 text-sm">
        <p v-for="warning in importWarnings" :key="warning" class="text-muted-foreground">{{ warning }}</p>
      </div>

      <div v-if="importRecords.length" class="mt-5 grid gap-3 border-t pt-5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-medium">{{ $t('portfolioDetail.manual.review') }}</h3>
          <div class="flex gap-2">
            <Button variant="ghost" size="sm" @click="discardImport">{{
              $t('portfolioDetail.manual.discardImport')
            }}</Button>
            <Button
              size="sm"
              :disabled="importHasBlockingRecords || executeImport.isPending.value"
              @click="executeReviewedImport().catch(handleImportError)"
            >
              {{ $t('portfolioDetail.manual.executeImport') }}
            </Button>
          </div>
        </div>
        <div
          v-for="record in importRecords"
          :key="record.tempId"
          class="grid gap-3 rounded-lg border p-3 lg:grid-cols-[auto_120px_140px_180px_120px_1fr] lg:items-end"
        >
          <label class="flex items-center gap-2 text-sm">
            <Checkbox
              :model-value="skipTempIds.includes(record.tempId)"
              @update:model-value="toggleSkip(record.tempId, $event)"
            />
            {{ $t('portfolioDetail.manual.skip') }}
          </label>
          <span class="text-muted-foreground text-xs">{{
            record.kind === 'valuation'
              ? $t('portfolioDetail.manual.kindValuation')
              : $t('portfolioDetail.manual.kindTransaction')
          }}</span>
          <InputField v-model="record.date" type="date" :label="$t('portfolioDetail.manual.date')" />
          <InputField
            v-model="record.amount"
            type="number"
            :label="
              record.kind === 'valuation' ? $t('portfolioDetail.manual.value') : $t('portfolioDetail.manual.amount')
            "
            min="0"
            only-positive
          />
          <InputField
            :model-value="record.currencyCode ?? ''"
            :label="$t('portfolioDetail.manual.currency')"
            maxlength="3"
            @update:model-value="updateImportCurrency(record, $event)"
          />
          <FieldLabel v-if="record.kind === 'transaction'" :label="$t('portfolioDetail.manual.category')">
            <Select.Select v-model="record.category">
              <Select.SelectTrigger><Select.SelectValue /></Select.SelectTrigger>
              <Select.SelectContent>
                <Select.SelectItem v-for="option in categoryOptions" :key="option.value" :value="option.value">{{
                  option.label
                }}</Select.SelectItem>
              </Select.SelectContent>
            </Select.Select>
          </FieldLabel>
          <InputField v-model="record.note" class="lg:col-span-2" :label="$t('portfolioDetail.manual.note')" />
          <div class="text-muted-foreground text-xs lg:col-span-2">
            <p>{{ $t('portfolioDetail.manual.confidence') }}: {{ Math.round(record.confidence * 100) }}%</p>
            <p v-if="record.sourceContext">{{ record.sourceContext }}</p>
            <p v-for="warning in record.warnings" :key="warning" class="text-amber-700">{{ warning }}</p>
            <p v-if="record.currencyMismatch" class="text-destructive-text">
              {{ $t('portfolioDetail.manual.currencyMismatch', { currency: overview?.currencyCode }) }}
            </p>
            <p v-if="record.possibleDuplicate" class="text-amber-700">
              {{ $t('portfolioDetail.manual.possibleDuplicate') }}
            </p>
          </div>
        </div>
      </div>
    </Card>

    <div class="grid gap-6 lg:grid-cols-2">
      <Card class="p-5">
        <div>
          <h2 class="font-semibold">{{ $t('portfolioDetail.manual.addTransaction') }}</h2>
          <p class="text-muted-foreground mt-1 max-w-[52ch] text-sm">
            {{ $t('portfolioDetail.manual.transactionDescription') }}
          </p>
        </div>
        <form class="mt-5 grid gap-4" @submit.prevent="saveTransaction().catch(handleImportError)">
          <p v-if="editingTransactionId" class="text-muted-foreground text-xs">
            {{ $t('portfolioDetail.manual.editingTransaction') }}
          </p>
          <div class="grid gap-4 sm:grid-cols-2">
            <InputField v-model="transaction.date" type="date" :label="$t('portfolioDetail.manual.date')" required />
            <FieldLabel :label="$t('portfolioDetail.manual.category')">
              <Select.Select v-model="transaction.category">
                <Select.SelectTrigger><Select.SelectValue /></Select.SelectTrigger>
                <Select.SelectContent>
                  <Select.SelectItem v-for="option in categoryOptions" :key="option.value" :value="option.value">{{
                    option.label
                  }}</Select.SelectItem>
                </Select.SelectContent>
              </Select.Select>
            </FieldLabel>
          </div>
          <InputField
            v-model="transaction.amount"
            type="number"
            inputmode="decimal"
            min="0.01"
            only-positive
            :label="$t('portfolioDetail.manual.amount')"
            required
          >
            <template #label-right>
              <span v-if="overview?.currencyCode" class="text-xs font-normal">{{ overview.currencyCode }}</span>
            </template>
          </InputField>
          <InputField v-model="transaction.note" :label="$t('portfolioDetail.manual.note')" />
          <Button
            class="mt-1 w-full"
            type="submit"
            :disabled="!canSaveTransaction || isSavingTransaction"
            :aria-busy="isSavingTransaction"
          >
            {{
              isSavingTransaction
                ? $t('portfolioDetail.manual.saving')
                : editingTransactionId
                  ? $t('portfolioDetail.manual.saveChanges')
                  : $t('portfolioDetail.manual.saveTransaction')
            }}
          </Button>
        </form>
      </Card>
      <Card class="p-5">
        <div>
          <h2 class="font-semibold">{{ $t('portfolioDetail.manual.addValuation') }}</h2>
          <p class="text-muted-foreground mt-1 max-w-[52ch] text-sm">
            {{ $t('portfolioDetail.manual.valuationDescription') }}
          </p>
        </div>
        <form class="mt-5 grid gap-4" @submit.prevent="saveValuation().catch(handleImportError)">
          <p v-if="editingValuationId" class="text-muted-foreground text-xs">
            {{ $t('portfolioDetail.manual.editingValuation') }}
          </p>
          <div class="grid gap-4 sm:grid-cols-2">
            <InputField v-model="valuation.date" type="date" :label="$t('portfolioDetail.manual.date')" required />
            <InputField
              v-model="valuation.value"
              type="number"
              inputmode="decimal"
              min="0"
              only-positive
              :label="$t('portfolioDetail.manual.value')"
              required
            >
              <template #label-right>
                <span v-if="overview?.currencyCode" class="text-xs font-normal">{{ overview.currencyCode }}</span>
              </template>
            </InputField>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <InputField v-model="valuation.note" :label="$t('portfolioDetail.manual.note')" />
            <InputField v-model="valuation.source" :label="$t('portfolioDetail.manual.source')" />
          </div>
          <Button
            class="mt-1 w-full"
            type="submit"
            :disabled="!canSaveValuation || isSavingValuation"
            :aria-busy="isSavingValuation"
          >
            {{
              isSavingValuation
                ? $t('portfolioDetail.manual.saving')
                : editingValuationId
                  ? $t('portfolioDetail.manual.saveChanges')
                  : $t('portfolioDetail.manual.saveValuation')
            }}
          </Button>
        </form>
      </Card>
    </div>

    <Card class="p-5">
      <h2 class="font-semibold">{{ $t('portfolioDetail.manual.timeline') }}</h2>
      <div v-if="overview" class="mt-4 divide-y">
        <div
          v-for="entry in overview.timeline"
          :key="`${entry.kind}-${entry.id}`"
          class="flex justify-between gap-3 py-3 text-sm"
        >
          <div>
            <p class="font-medium">
              {{
                entry.kind === 'valuation'
                  ? $t('portfolioDetail.manual.valuation')
                  : $t(`portfolioDetail.manual.categories.${entry.category}`)
              }}
            </p>
            <p class="text-muted-foreground">
              {{ entry.date }} · {{ entry.note || (entry.kind === 'linked-transfer' ? '' : entry.source || '') }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <p>{{ entry.kind === 'valuation' ? money(entry.value) : money(entry.amount) }}</p>
            <template v-if="entry.kind !== 'linked-transfer'">
              <Button variant="link" size="sm" type="button" @click="editEntry(entry)">{{
                $t('portfolioDetail.manual.edit')
              }}</Button>
              <Button variant="ghost-destructive" size="sm" type="button" @click="removeEntry(entry)">{{
                $t('portfolioDetail.manual.delete')
              }}</Button>
            </template>
          </div>
        </div>
      </div>
    </Card>
  </div>
</template>
