<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { TextareaField } from '@/components/fields';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import {
  useImportManualPortfolioJson,
  useManualPortfolioValues,
} from '@/composable/data-queries/manual-portfolio-values';
import { getApiErrorMessage } from '@/js/errors';
import {
  MANUAL_PORTFOLIO_JSON_FORMAT,
  MANUAL_PORTFOLIO_JSON_VERSION,
  MANUAL_PORTFOLIO_TRANSACTION_CATEGORY,
  type ManualPortfolioJsonExport,
} from '@bt/shared/types/investments';
import { ClipboardIcon, CopyIcon } from '@lucide/vue';
import { computed, ref, toRef } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  portfolioId: string;
  portfolioName: string;
}>();

const { t } = useI18n();
const { addNotification } = useNotificationCenter();
const isOpen = ref(false);
const portfolioJson = ref('');
const portfolioId = toRef(props, 'portfolioId');
const values = useManualPortfolioValues(portfolioId);
const importJson = useImportManualPortfolioJson();
const overview = computed(() => values.data.value);

const jsonExport = computed<ManualPortfolioJsonExport | null>(() => {
  const current = overview.value;
  if (!current) return null;
  return {
    format: MANUAL_PORTFOLIO_JSON_FORMAT,
    version: MANUAL_PORTFOLIO_JSON_VERSION,
    portfolioName: props.portfolioName,
    currencyCode: current.currencyCode,
    transactions: current.timeline.flatMap((entry) =>
      entry.kind === 'transaction'
        ? [{ category: entry.category, amount: entry.amount, date: entry.date, note: entry.note, source: entry.source }]
        : entry.kind === 'linked-transfer'
          ? [
              {
                category:
                  entry.category === 'contribution'
                    ? MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.contribution
                    : MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.withdrawal,
                amount: entry.amount,
                date: entry.date,
                note: entry.note,
                source: 'json-linked-transfer',
              },
            ]
          : [],
    ),
    valuations: current.timeline.flatMap((entry) =>
      entry.kind === 'valuation'
        ? [{ value: entry.value, date: entry.date, note: entry.note, source: entry.source }]
        : [],
    ),
  };
});

const notifyError = (error: unknown) => {
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

const copyPortfolioJson = async () => {
  if (!jsonExport.value) return;
  const json = JSON.stringify(jsonExport.value, null, 2);
  portfolioJson.value = json;
  try {
    await navigator.clipboard.writeText(json);
    addNotification({ type: NotificationType.success, text: t('portfolioDetail.manual.jsonCopied') });
  } catch {
    addNotification({ type: NotificationType.error, text: t('portfolioDetail.manual.jsonCopyError') });
  }
};

const pastePortfolioJson = async () => {
  try {
    portfolioJson.value = await navigator.clipboard.readText();
  } catch {
    addNotification({ type: NotificationType.error, text: t('portfolioDetail.manual.jsonPasteError') });
  }
};

const importPortfolioJson = async () => {
  if (!portfolioJson.value.trim()) return;
  let payload: ManualPortfolioJsonExport;
  try {
    payload = JSON.parse(portfolioJson.value) as ManualPortfolioJsonExport;
  } catch {
    addNotification({ type: NotificationType.error, text: t('portfolioDetail.manual.jsonInvalid') });
    return;
  }

  try {
    const result = await importJson.mutateAsync({ portfolioId: props.portfolioId, payload });
    addNotification({ type: NotificationType.success, text: t('portfolioDetail.manual.jsonImportSuccess', result) });
    portfolioJson.value = '';
    isOpen.value = false;
  } catch (error) {
    notifyError(error);
  }
};
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen" dialog-content-class="max-w-3xl" drawer-content-class="max-h-[92dvh]">
    <template #trigger>
      <UiButton variant="outline" size="sm" type="button">
        <CopyIcon class="size-4" />
        {{ $t('portfolioDetail.actions.shareJson') }}
      </UiButton>
    </template>

    <template #title>{{ $t('portfolioDetail.manual.jsonTitle') }}</template>
    <template #description>{{ $t('portfolioDetail.manual.jsonDescription') }}</template>

    <div class="grid gap-4">
      <div class="flex flex-wrap gap-2">
        <UiButton size="sm" type="button" :disabled="!jsonExport" @click="copyPortfolioJson">
          <CopyIcon class="size-4" />
          {{ $t('portfolioDetail.manual.copyJson') }}
        </UiButton>
        <UiButton size="sm" type="button" variant="outline" @click="pastePortfolioJson">
          <ClipboardIcon class="size-4" />
          {{ $t('portfolioDetail.manual.pasteJson') }}
        </UiButton>
      </div>

      <TextareaField
        v-model="portfolioJson"
        class="font-mono text-xs"
        :label="$t('portfolioDetail.manual.jsonFieldLabel')"
        :rows="12"
        :placeholder="$t('portfolioDetail.manual.jsonPlaceholder')"
      />

      <p class="text-muted-foreground text-xs">{{ $t('portfolioDetail.manual.jsonMergeDescription') }}</p>
    </div>

    <template #footer="{ close }">
      <UiButton variant="ghost" type="button" @click="close">{{ $t('common.ui.close') }}</UiButton>
      <UiButton
        type="button"
        :disabled="!portfolioJson.trim() || importJson.isPending.value"
        @click="importPortfolioJson"
      >
        {{ $t('portfolioDetail.manual.importJson') }}
      </UiButton>
    </template>
  </ResponsiveDialog>
</template>
