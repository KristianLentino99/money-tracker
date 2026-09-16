<script setup lang="ts">
import { searchSecurities } from '@/api/securities';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import SecurityLogo from '@/components/common/security-logo.vue';
import { Button } from '@/components/lib/ui/button';
import { Checkbox } from '@/components/lib/ui/checkbox';
import * as Popover from '@/components/lib/ui/popover';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import { useCurrencyName } from '@/composable/formatters';
import { useCurrenciesStore } from '@/stores/currencies';
import type { CurrencyModel } from '@bt/shared/types';
import type { PortfolioModel, SecuritySearchResultFormatted } from '@bt/shared/types/investments';
import { useQuery } from '@tanstack/vue-query';
import { ChevronDownIcon, PlusIcon, SearchIcon, Trash2Icon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import type { InvestmentContributionForm, InvestmentContributionPurchaseForm } from '../types';

const props = defineProps<{
  disabled?: boolean;
  currencyCode?: string;
  transferAmount?: number | null;
  portfolioDisabled?: boolean;
  portfolios: Pick<PortfolioModel, 'id' | 'name'>[];
}>();

const model = defineModel<InvestmentContributionForm>({ required: true });
const { t } = useI18n();
const currenciesStore = useCurrenciesStore();
const { formatCurrencyLabel } = useCurrencyName();

const searchRowIndex = ref<number | null>(null);
const searchTerm = ref('');
const debouncedSearchTerm = ref('');
const isSecurityPickerOpen = ref(false);
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const selectedPortfolioId = computed(() => model.value.portfolio?.id);
const securitiesQuery = useQuery({
  queryKey: computed(() => [
    ...VUE_QUERY_CACHE_KEYS.investmentImportSecuritySearch,
    debouncedSearchTerm.value,
    selectedPortfolioId.value,
  ]),
  queryFn: () =>
    searchSecurities({
      query: debouncedSearchTerm.value,
      portfolioId: selectedPortfolioId.value,
    }),
  enabled: () => isSecurityPickerOpen.value && debouncedSearchTerm.value.length >= 1 && !!selectedPortfolioId.value,
});

watch(searchTerm, (value) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    debouncedSearchTerm.value = value.trim();
  }, 250);
});

const selectedProviderSymbols = computed(
  () =>
    new Set(
      model.value.purchases
        .map((purchase, index) => (index === searchRowIndex.value ? null : purchase.searchResult?.providerSymbol))
        .filter((symbol): symbol is string => Boolean(symbol)),
    ),
);

const createPurchase = (): InvestmentContributionPurchaseForm => ({
  searchResult: null,
  quantity: '',
  price: '',
  fees: '0',
  date: new Date(),
  settlementCurrency: null,
  settlementAmount: '',
  settlementFees: '0',
});

const openSecurityPicker = (index: number) => {
  searchRowIndex.value = index;
  searchTerm.value = model.value.purchases[index]?.searchResult?.symbol ?? '';
  debouncedSearchTerm.value = searchTerm.value;
  isSecurityPickerOpen.value = true;
};

const closeSecurityPicker = () => {
  isSecurityPickerOpen.value = false;
  searchRowIndex.value = null;
  searchTerm.value = '';
  debouncedSearchTerm.value = '';
};

const pickSecurity = (security: SecuritySearchResultFormatted) => {
  if (searchRowIndex.value == null) return;
  const purchase = model.value.purchases[searchRowIndex.value];
  if (!purchase) return;

  purchase.searchResult = security;
  purchase.securityLabel = undefined;
  purchase.securityId = undefined;
  if (!purchase.settlementCurrency) {
    purchase.settlementCurrency =
      currenciesStore.systemCurrencies.find((currency) => currency.code === security.currencyCode) ?? null;
  }
  closeSecurityPicker();
};

const clearSecurity = (purchase: InvestmentContributionPurchaseForm) => {
  purchase.searchResult = null;
  purchase.securityId = undefined;
  purchase.securityLabel = undefined;
  purchase.settlementCurrency = null;
  purchase.settlementAmount = '';
};

const addPurchase = () => {
  model.value.purchases.push(createPurchase());
};

const removePurchase = (index: number) => {
  if (model.value.purchases.length <= 1) return;
  model.value.purchases.splice(index, 1);
};

const setSettlementEnabled = (purchase: InvestmentContributionPurchaseForm, enabled: boolean) => {
  if (enabled) {
    purchase.settlementCurrency =
      purchase.settlementCurrency ??
      currenciesStore.systemCurrencies.find(
        (currency) => currency.code === (purchase.searchResult?.currencyCode ?? purchase.securityLabel?.currencyCode),
      ) ??
      null;
    return;
  }
  purchase.settlementCurrency = null;
  purchase.settlementAmount = '';
  purchase.settlementFees = '0';
};

const hasSecurity = (purchase: InvestmentContributionPurchaseForm) => !!purchase.searchResult || !!purchase.securityId;
const isSettlementEnabled = (purchase: InvestmentContributionPurchaseForm) => !!purchase.settlementCurrency;

const purchaseTotal = (purchase: InvestmentContributionPurchaseForm) => {
  const total = Number(purchase.quantity || 0) * Number(purchase.price || 0) + Number(purchase.fees || 0);
  return Number.isFinite(total) ? total : 0;
};

const displayTotal = (purchase: InvestmentContributionPurchaseForm) =>
  purchase.settlementCurrency && purchase.settlementAmount
    ? Number(purchase.settlementAmount)
    : purchaseTotal(purchase);

const formatTotal = (purchase: InvestmentContributionPurchaseForm) => displayTotal(purchase).toFixed(2);

const totalInvested = computed(() =>
  model.value.purchases.reduce((total, purchase) => total + displayTotal(purchase), 0),
);

const totalsByCurrency = computed(() => {
  const totals = new Map<string, number>();
  for (const purchase of model.value.purchases) {
    const code = purchase.settlementCurrency?.code ?? purchase.searchResult?.currencyCode ?? props.currencyCode;
    if (!code) continue;
    totals.set(code, (totals.get(code) ?? 0) + displayTotal(purchase));
  }
  return [...totals.entries()].map(([code, total]) => ({
    code,
    total,
    residual: code === props.currencyCode && props.transferAmount != null ? props.transferAmount - total : null,
  }));
});

const totalCurrencyCode = computed(() => {
  const currencies = new Set(
    model.value.purchases.map(
      (purchase) => purchase.settlementCurrency?.code ?? purchase.searchResult?.currencyCode ?? props.currencyCode,
    ),
  );
  return currencies.size === 1 ? [...currencies][0] : null;
});

const currencyLabel = (currency: CurrencyModel) =>
  formatCurrencyLabel({ code: currency.code, fallbackName: currency.currency });
</script>

<template>
  <section
    class="border-border bg-muted/20 @container grid gap-4 rounded-lg border p-4"
    data-test="investment-contribution-fields"
  >
    <div class="flex items-start justify-between gap-3">
      <div>
        <h3 class="text-sm font-semibold">{{ $t('dialogs.manageTransaction.investmentContribution.title') }}</h3>
        <p class="text-muted-foreground mt-1 text-xs">
          {{ $t('dialogs.manageTransaction.investmentContribution.hint') }}
        </p>
      </div>
      <div v-if="totalsByCurrency.length" class="text-muted-foreground grid justify-items-end text-xs tabular-nums">
        <span v-for="summary in totalsByCurrency" :key="summary.code">
          {{ summary.total.toFixed(2) }} {{ summary.code }}
          <template v-if="summary.residual != null">
            · {{ $t('dialogs.manageTransaction.investmentContribution.residualLabel') }}
            {{ summary.residual.toFixed(2) }} {{ summary.code }}
          </template>
        </span>
      </div>
    </div>

    <SelectField
      v-model="model.portfolio"
      :label="$t('dialogs.manageTransaction.investmentContribution.portfolioLabel')"
      :values="props.portfolios"
      value-key="id"
      label-key="name"
      :placeholder="$t('dialogs.manageTransaction.investmentContribution.portfolioPlaceholder')"
      :disabled="props.disabled || props.portfolioDisabled"
    />

    <div class="grid gap-4">
      <article
        v-for="(purchase, index) in model.purchases"
        :key="index"
        class="border-border bg-background/70 grid gap-3 rounded-md border p-3"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {{ $t('dialogs.manageTransaction.investmentContribution.purchaseNumber', { number: index + 1 }) }}
          </span>
          <Button
            v-if="model.purchases.length > 1"
            type="button"
            variant="ghost"
            size="icon-sm"
            :disabled="props.disabled"
            :aria-label="$t('dialogs.manageTransaction.investmentContribution.removePurchase')"
            @click="removePurchase(index)"
          >
            <Trash2Icon class="size-4" />
          </Button>
        </div>

        <Popover.Popover
          :open="isSecurityPickerOpen && searchRowIndex === index"
          @update:open="(open) => !open && closeSecurityPicker()"
        >
          <Popover.PopoverTrigger as-child>
            <Button
              type="button"
              variant="outline"
              class="flex h-auto min-h-10 w-full items-center justify-between gap-2 px-3 py-2 text-left font-normal"
              :disabled="props.disabled || !model.portfolio"
              @click="openSecurityPicker(index)"
            >
              <span v-if="hasSecurity(purchase)" class="min-w-0 truncate">
                <SecurityLogo
                  v-if="purchase.searchResult"
                  :security="purchase.searchResult"
                  class="mr-2 inline-block size-5 align-middle"
                />
                <span class="font-medium">
                  {{ purchase.searchResult?.symbol ?? purchase.securityLabel?.symbol ?? purchase.securityId }}
                </span>
                <span class="text-muted-foreground ml-2 text-xs">
                  {{ purchase.searchResult?.name ?? purchase.securityLabel?.name }}
                </span>
              </span>
              <span v-else class="text-muted-foreground">
                {{ $t('dialogs.manageTransaction.investmentContribution.securityPlaceholder') }}
              </span>
              <ChevronDownIcon class="text-muted-foreground size-4 shrink-0" />
            </Button>
          </Popover.PopoverTrigger>
          <Popover.PopoverContent class="w-[min(24rem,calc(100vw-3rem))] p-0" align="start">
            <div class="border-border border-b p-2">
              <InputField
                v-model="searchTerm"
                autofocus
                :placeholder="$t('dialogs.manageTransaction.investmentContribution.securitySearchPlaceholder')"
              >
                <template #iconLeading><SearchIcon class="text-muted-foreground size-4" /></template>
              </InputField>
            </div>
            <ScrollArea class="max-h-64">
              <div v-if="securitiesQuery.isFetching.value" class="text-muted-foreground p-4 text-center text-xs">
                {{ $t('common.loading') }}
              </div>
              <div v-else-if="!debouncedSearchTerm" class="text-muted-foreground p-4 text-center text-xs">
                {{ $t('dialogs.manageTransaction.investmentContribution.securitySearchHint') }}
              </div>
              <div
                v-else-if="!securitiesQuery.data.value?.length"
                class="text-muted-foreground p-4 text-center text-xs"
              >
                {{ $t('dialogs.manageTransaction.investmentContribution.securityNoResults') }}
              </div>
              <div v-else class="py-1">
                <Button
                  v-for="security in securitiesQuery.data.value"
                  :key="`${security.providerName}:${security.providerSymbol}`"
                  type="button"
                  variant="ghost"
                  class="flex h-auto w-full items-center gap-2 rounded-none px-3 py-2 text-left font-normal"
                  :disabled="selectedProviderSymbols.has(security.providerSymbol)"
                  @click="pickSecurity(security)"
                >
                  <SecurityLogo :security="security" class="size-5 shrink-0" />
                  <span class="min-w-0 flex-1 truncate">
                    <span class="font-medium">{{ security.symbol }}</span>
                    <span class="text-muted-foreground ml-2 text-xs">{{ security.name }}</span>
                  </span>
                  <span class="text-muted-foreground text-xs">{{ security.currencyCode }}</span>
                </Button>
              </div>
            </ScrollArea>
          </Popover.PopoverContent>
        </Popover.Popover>

        <div class="grid grid-cols-2 gap-3 @md:grid-cols-4">
          <InputField
            v-model="purchase.quantity"
            type="number"
            step="any"
            :label="$t('dialogs.manageTransaction.investmentContribution.quantityLabel')"
            :disabled="props.disabled || !hasSecurity(purchase)"
          />
          <InputField
            v-model="purchase.price"
            type="number"
            step="any"
            :label="$t('dialogs.manageTransaction.investmentContribution.priceLabel')"
            :disabled="props.disabled || !hasSecurity(purchase)"
          />
          <InputField
            v-model="purchase.fees"
            type="number"
            step="any"
            :label="$t('dialogs.manageTransaction.investmentContribution.feesLabel')"
            :disabled="props.disabled || !hasSecurity(purchase)"
          />
          <DateField
            v-model="purchase.date"
            :label="$t('dialogs.manageTransaction.investmentContribution.dateLabel')"
            :disabled="props.disabled || !hasSecurity(purchase)"
          />
        </div>

        <div class="flex items-center justify-between gap-3">
          <span class="text-muted-foreground text-xs">
            {{ $t('dialogs.manageTransaction.investmentContribution.rowTotal') }}:
            <strong class="text-foreground tabular-nums">
              {{ formatTotal(purchase) }}
              {{ purchase.settlementCurrency?.code ?? purchase.searchResult?.currencyCode ?? props.currencyCode }}
            </strong>
          </span>
          <label class="flex items-center gap-2 text-xs">
            <Checkbox
              :model-value="isSettlementEnabled(purchase)"
              :disabled="props.disabled || !hasSecurity(purchase)"
              @update:model-value="(checked) => setSettlementEnabled(purchase, Boolean(checked))"
            />
            {{ $t('dialogs.manageTransaction.investmentContribution.useSettlement') }}
          </label>
        </div>

        <div v-if="isSettlementEnabled(purchase)" class="grid gap-3 @md:grid-cols-3">
          <SelectField
            v-model="purchase.settlementCurrency"
            :label="$t('dialogs.manageTransaction.investmentContribution.settlementCurrencyLabel')"
            :values="currenciesStore.systemCurrencies"
            value-key="code"
            :label-key="currencyLabel"
            with-search
            :disabled="props.disabled"
          />
          <InputField
            v-model="purchase.settlementAmount"
            type="number"
            step="any"
            :label="$t('dialogs.manageTransaction.investmentContribution.settlementAmountLabel')"
            :disabled="props.disabled"
          />
          <InputField
            v-model="purchase.settlementFees"
            type="number"
            step="any"
            :label="$t('dialogs.manageTransaction.investmentContribution.settlementFeesLabel')"
            :disabled="props.disabled"
          />
        </div>

        <InputField
          v-model="purchase.name"
          :label="$t('dialogs.manageTransaction.investmentContribution.noteLabel')"
          :disabled="props.disabled || !hasSecurity(purchase)"
          :placeholder="$t('dialogs.manageTransaction.investmentContribution.notePlaceholder')"
        />

        <Button
          v-if="hasSecurity(purchase)"
          type="button"
          variant="ghost"
          class="justify-start px-0 text-xs"
          :disabled="props.disabled"
          @click="clearSecurity(purchase)"
        >
          {{ $t('dialogs.manageTransaction.investmentContribution.changeSecurity') }}
        </Button>
      </article>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        :disabled="props.disabled || !model.portfolio"
        @click="addPurchase"
      >
        <PlusIcon class="size-4" />
        {{ $t('dialogs.manageTransaction.investmentContribution.addPurchase') }}
      </Button>
      <p v-if="totalCurrencyCode" class="text-muted-foreground text-xs tabular-nums">
        {{ $t('dialogs.manageTransaction.investmentContribution.totalLabel') }}:
        <span class="text-foreground font-semibold">{{ totalInvested.toFixed(2) }} {{ totalCurrencyCode }}</span>
      </p>
    </div>
  </section>
</template>
