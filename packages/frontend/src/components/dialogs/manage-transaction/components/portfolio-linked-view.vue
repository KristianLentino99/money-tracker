<script lang="ts" setup>
import DeletedBadge from '@/components/common/deleted-badge.vue';
import { Button } from '@/components/lib/ui/button';
import * as AlertDialog from '@/components/lib/ui/alert-dialog';
import InvestmentContributionFields from './investment-contribution-fields.vue';
import {
  useDeletePortfolioTransfer,
  useTransactionPortfolioLink,
  useUnlinkTransactionFromPortfolio,
  useUpdateInvestmentContribution,
} from '@/composable/data-queries/portfolio-transfers';
import { useDeleteInvestmentTransaction } from '@/composable/data-queries/investment-transactions';
import { formatUIAmount } from '@/js/helpers';
import { useCurrenciesStore } from '@/stores/currencies';
import { ROUTES_NAMES } from '@/routes';
import type { TransactionModel } from '@bt/shared/types';
import type { InvestmentContributionForm, InvestmentContributionPurchaseForm } from '../types';
import { Trash2Icon } from '@lucide/vue';
import { DialogClose, DialogTitle } from 'reka-ui';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

const props = defineProps<{
  transaction: TransactionModel;
}>();

const emit = defineEmits<{
  'close-modal': [];
}>();

const transactionId = computed(() => props.transaction.id);
const currenciesStore = useCurrenciesStore();
const { data: linkData, isLoading } = useTransactionPortfolioLink(transactionId);
const unlinkMutation = useUnlinkTransactionFromPortfolio();
const deleteMutation = useDeletePortfolioTransfer();
const deletePurchaseMutation = useDeleteInvestmentTransaction();
const updateMutation = useUpdateInvestmentContribution();

const isEditing = ref(false);
const editForm = ref<InvestmentContributionForm | null>(null);
const editableContribution = computed<InvestmentContributionForm>({
  get: () => editForm.value ?? { portfolio: null, purchases: [] },
  set: (value) => {
    editForm.value = value;
  },
});

const isUnlinkAlertOpen = ref(false);
const isDeleteAlertOpen = ref(false);
const isDeletePurchaseAlertOpen = ref(false);
const hasPurchases = computed(() => (linkData.value?.investmentTransactions?.length ?? 0) > 0);
const purchaseToDeleteId = ref<string | null>(null);
const purchaseToDelete = computed(() =>
  linkData.value?.investmentTransactions.find((purchase) => purchase.id === purchaseToDeleteId.value),
);

const editPortfolios = computed(() =>
  linkData.value ? [{ id: linkData.value.portfolioId, name: linkData.value.portfolioName }] : [],
);

const startEditing = () => {
  if (!linkData.value) return;
  editForm.value = {
    portfolio: { id: linkData.value.portfolioId, name: linkData.value.portfolioName },
    purchases: linkData.value.investmentTransactions.map((purchase) => ({
      securityId: purchase.securityId,
      searchResult: null,
      ...(purchase.security ? { securityLabel: purchase.security } : {}),
      quantity: purchase.quantity,
      price: purchase.price,
      fees: purchase.fees,
      date: new Date(purchase.date),
      name: purchase.name ?? undefined,
      settlementCurrency:
        currenciesStore.systemCurrencies.find((currency) => currency.code === purchase.settlementCurrencyCode) ?? null,
      settlementAmount: purchase.settlementAmount,
      settlementFees: purchase.settlementFees,
    })),
  };
  isEditing.value = true;
};

const cancelEditing = () => {
  isEditing.value = false;
  editForm.value = null;
};

const canSaveEdit = computed(() => {
  const purchases = editForm.value?.purchases ?? [];
  return (
    purchases.length > 0 &&
    purchases.every(
      (purchase) =>
        (!!purchase.searchResult || !!purchase.securityId) &&
        Number(purchase.quantity) > 0 &&
        Number(purchase.price) >= 0 &&
        Number(purchase.fees || 0) >= 0 &&
        Number.isFinite(purchase.date.getTime()) &&
        (!purchase.settlementCurrency || Number(purchase.settlementAmount) >= 0),
    )
  );
});

const editPayload = computed(() =>
  (editForm.value?.purchases ?? []).map((purchase) => ({
    ...(purchase.securityId ? { securityId: purchase.securityId } : { searchResult: purchase.searchResult! }),
    quantity: purchase.quantity,
    price: purchase.price,
    fees: purchase.fees || '0',
    date: purchase.date.toISOString(),
    ...(purchase.name?.trim() ? { name: purchase.name.trim() } : {}),
    ...(purchase.settlementCurrency
      ? {
          settlementCurrencyCode: purchase.settlementCurrency.code,
          settlementAmount: purchase.settlementAmount,
          ...(purchase.settlementCurrency.code !==
          (purchase.searchResult?.currencyCode ?? purchase.securityLabel?.currencyCode)
            ? { settlementFees: purchase.settlementFees || '0' }
            : {}),
        }
      : {}),
  })),
);

const saveEdit = () => {
  if (!linkData.value || !canSaveEdit.value) return;
  updateMutation.mutate(
    {
      portfolioId: linkData.value.portfolioId,
      transferId: linkData.value.transferId,
      purchases: editPayload.value,
    },
    { onSuccess: cancelEditing },
  );
};

const handleUnlink = () => {
  unlinkMutation.mutate(
    { transactionId: props.transaction.id },
    {
      onSuccess: () => {
        isUnlinkAlertOpen.value = false;
        emit('close-modal');
      },
    },
  );
};

const requestDeletePurchase = (purchaseId: string) => {
  purchaseToDeleteId.value = purchaseId;
  isDeletePurchaseAlertOpen.value = true;
};

const handleDeletePurchase = () => {
  if (!purchaseToDeleteId.value) return;
  deletePurchaseMutation.mutate(purchaseToDeleteId.value, {
    onSuccess: () => {
      purchaseToDeleteId.value = null;
      isDeletePurchaseAlertOpen.value = false;
    },
  });
};

const handleDeleteContribution = () => {
  if (!linkData.value) return;
  deleteMutation.mutate(
    {
      portfolioId: linkData.value.portfolioId,
      transferId: linkData.value.transferId,
      deleteLinkedTransaction: true,
      deleteLinkedInvestmentTransactions: true,
    },
    {
      onSuccess: () => {
        isDeleteAlertOpen.value = false;
        emit('close-modal');
      },
    },
  );
};
</script>

<template>
  <div class="rounded-t-xl">
    <div class="bg-app-transfer-color h-3 rounded-t-lg" />
    <div class="mb-4 flex items-center justify-between px-6 py-3">
      <DialogTitle>
        <span class="text-2xl">
          {{ $t('dialogs.manageTransaction.portfolioLinked.title') }}
        </span>
      </DialogTitle>

      <DialogClose>
        <Button variant="ghost" @click="emit('close-modal')">
          {{ $t('dialogs.manageTransaction.form.closeButton') }}
        </Button>
      </DialogClose>
    </div>

    <div class="px-6 pb-6">
      <template v-if="isLoading">
        <div class="text-muted-foreground py-8 text-center text-sm">
          {{ $t('common.loading') }}
        </div>
      </template>

      <template v-else-if="linkData">
        <div class="bg-muted/30 border-border rounded-lg border p-4">
          <p class="text-sm">
            {{
              $t('dialogs.manageTransaction.portfolioLinked.linkedAs', {
                type:
                  linkData.transferType === 'deposit'
                    ? $t('dialogs.manageTransaction.portfolioLinked.deposit')
                    : $t('dialogs.manageTransaction.portfolioLinked.withdrawal'),
              })
            }}
            <template v-if="linkData.isPortfolioDeleted">
              <span class="text-muted-foreground line-through">{{ linkData.portfolioName }}</span>
              <DeletedBadge class="ml-2" />
            </template>
            <RouterLink
              v-else
              :to="{ name: ROUTES_NAMES.portfolioDetail, params: { portfolioId: linkData.portfolioId } }"
              class="text-primary-text underline underline-offset-2"
              @click="emit('close-modal')"
            >
              {{ linkData.portfolioName }}
            </RouterLink>
          </p>
          <p class="text-muted-foreground mt-2 text-sm">
            {{ formatUIAmount(Number(linkData.amount), { currency: linkData.currencyCode }) }}
            &middot;
            {{ linkData.date }}
            <span
              v-if="!linkData.affectsCash"
              class="bg-muted text-muted-foreground ml-2 rounded-full px-2 py-0.5 text-xs font-medium tracking-wide uppercase"
            >
              {{ $t('portfolioDetail.cashBalances.cashTransactions.noCashBadge') }}
            </span>
          </p>
        </div>

        <template v-if="isEditing && editForm">
          <InvestmentContributionFields
            v-model="editableContribution"
            class="mt-4"
            :disabled="updateMutation.isPending.value"
            :portfolio-disabled="true"
            :transfer-amount="Number(linkData.amount)"
            :currency-code="linkData.currencyCode"
            :portfolios="editPortfolios"
          />
          <div class="mt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" :disabled="updateMutation.isPending.value" @click="cancelEditing">
              {{ $t('dialogs.manageTransaction.portfolioLinked.cancelEdit') }}
            </Button>
            <Button type="button" :disabled="!canSaveEdit || updateMutation.isPending.value" @click="saveEdit">
              {{ $t('dialogs.manageTransaction.portfolioLinked.saveEdit') }}
            </Button>
          </div>
        </template>

        <div v-else-if="hasPurchases" class="border-border mt-4 rounded-lg border p-4">
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm font-medium">
              {{ $t('dialogs.manageTransaction.portfolioLinked.purchasesTitle') }}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              :disabled="linkData.isPortfolioDeleted"
              @click="startEditing"
            >
              {{ $t('dialogs.manageTransaction.portfolioLinked.editPurchasesButton') }}
            </Button>
          </div>
          <ul class="mt-3 grid gap-2">
            <li
              v-for="purchase in linkData.investmentTransactions"
              :key="purchase.id"
              class="bg-muted/30 flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm"
            >
              <span class="min-w-0 truncate">
                <span class="font-medium">{{ purchase.security?.symbol ?? purchase.securityId }}</span>
                <span class="text-muted-foreground ml-2 text-xs">{{ purchase.date.slice(0, 10) }}</span>
              </span>
              <span class="flex shrink-0 items-center gap-2">
                <span class="text-muted-foreground tabular-nums">
                  {{
                    formatUIAmount(Number(purchase.settlementAmount), {
                      currency: purchase.settlementCurrencyCode,
                    })
                  }}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  :disabled="deletePurchaseMutation.isPending.value"
                  :aria-label="$t('dialogs.manageTransaction.portfolioLinked.deletePurchaseButton')"
                  @click="requestDeletePurchase(purchase.id)"
                >
                  <Trash2Icon class="size-4" />
                </Button>
              </span>
            </li>
          </ul>
        </div>

        <AlertDialog.AlertDialog v-if="purchaseToDelete" v-model:open="isDeletePurchaseAlertOpen">
          <AlertDialog.AlertDialogContent>
            <AlertDialog.AlertDialogHeader>
              <AlertDialog.AlertDialogTitle>
                {{ $t('dialogs.manageTransaction.portfolioLinked.deletePurchaseTitle') }}
              </AlertDialog.AlertDialogTitle>
              <AlertDialog.AlertDialogDescription>
                {{ $t('dialogs.manageTransaction.portfolioLinked.deletePurchaseDescription') }}
              </AlertDialog.AlertDialogDescription>
            </AlertDialog.AlertDialogHeader>
            <AlertDialog.AlertDialogFooter>
              <AlertDialog.AlertDialogCancel @click="purchaseToDeleteId = null">
                {{ $t('dialogs.manageTransaction.portfolioLinked.cancelButton') }}
              </AlertDialog.AlertDialogCancel>
              <AlertDialog.AlertDialogAction
                variant="destructive"
                :disabled="deletePurchaseMutation.isPending.value"
                @click="handleDeletePurchase"
              >
                {{ $t('dialogs.manageTransaction.portfolioLinked.confirmDeletePurchase') }}
              </AlertDialog.AlertDialogAction>
            </AlertDialog.AlertDialogFooter>
          </AlertDialog.AlertDialogContent>
        </AlertDialog.AlertDialog>

        <AlertDialog.AlertDialog v-if="!hasPurchases" v-model:open="isUnlinkAlertOpen">
          <AlertDialog.AlertDialogTrigger as-child>
            <Button variant="outline" class="mt-4 w-full">
              {{ $t('dialogs.manageTransaction.portfolioLinked.unlinkButton') }}
            </Button>
          </AlertDialog.AlertDialogTrigger>
          <AlertDialog.AlertDialogContent>
            <AlertDialog.AlertDialogHeader>
              <AlertDialog.AlertDialogTitle>
                {{ $t('dialogs.manageTransaction.portfolioLinked.unlinkButton') }}
              </AlertDialog.AlertDialogTitle>
              <AlertDialog.AlertDialogDescription>
                {{
                  $t(
                    linkData.affectsCash
                      ? 'dialogs.manageTransaction.portfolioLinked.unlinkWarning'
                      : 'dialogs.manageTransaction.portfolioLinked.unlinkWarningNoCash',
                    { portfolio: linkData.portfolioName },
                  )
                }}
                {{ $t('dialogs.manageTransaction.portfolioLinked.unlinkDescription') }}
              </AlertDialog.AlertDialogDescription>
            </AlertDialog.AlertDialogHeader>
            <AlertDialog.AlertDialogFooter>
              <AlertDialog.AlertDialogCancel>
                {{ $t('dialogs.manageTransaction.portfolioLinked.cancelButton') }}
              </AlertDialog.AlertDialogCancel>
              <AlertDialog.AlertDialogAction
                variant="destructive"
                :disabled="unlinkMutation.isPending.value"
                @click="handleUnlink"
              >
                {{ $t('dialogs.manageTransaction.portfolioLinked.confirmUnlink') }}
              </AlertDialog.AlertDialogAction>
            </AlertDialog.AlertDialogFooter>
          </AlertDialog.AlertDialogContent>
        </AlertDialog.AlertDialog>

        <AlertDialog.AlertDialog v-if="hasPurchases && !isEditing" v-model:open="isDeleteAlertOpen">
          <AlertDialog.AlertDialogTrigger as-child>
            <Button variant="destructive" class="mt-4 w-full">
              {{ $t('dialogs.manageTransaction.portfolioLinked.deleteContributionButton') }}
            </Button>
          </AlertDialog.AlertDialogTrigger>
          <AlertDialog.AlertDialogContent>
            <AlertDialog.AlertDialogHeader>
              <AlertDialog.AlertDialogTitle>
                {{ $t('dialogs.manageTransaction.portfolioLinked.deleteContributionTitle') }}
              </AlertDialog.AlertDialogTitle>
              <AlertDialog.AlertDialogDescription>
                {{ $t('dialogs.manageTransaction.portfolioLinked.deleteContributionDescription') }}
              </AlertDialog.AlertDialogDescription>
            </AlertDialog.AlertDialogHeader>
            <AlertDialog.AlertDialogFooter>
              <AlertDialog.AlertDialogCancel>
                {{ $t('dialogs.manageTransaction.portfolioLinked.cancelButton') }}
              </AlertDialog.AlertDialogCancel>
              <AlertDialog.AlertDialogAction
                variant="destructive"
                :disabled="deleteMutation.isPending.value"
                @click="handleDeleteContribution"
              >
                {{ $t('dialogs.manageTransaction.portfolioLinked.confirmDeleteContribution') }}
              </AlertDialog.AlertDialogAction>
            </AlertDialog.AlertDialogFooter>
          </AlertDialog.AlertDialogContent>
        </AlertDialog.AlertDialog>
      </template>
    </div>
  </div>
</template>
