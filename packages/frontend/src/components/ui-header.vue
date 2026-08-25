<template>
  <div ref="headerRef">
    <DemoBanner />
    <div class="shadow-header border-border flex items-center justify-between border-b px-4 py-2 sm:px-6">
      <div class="flex items-center gap-4">
        <ManageTransactionDialog v-if="isMobileView">
          <Button
            data-testid="mobile-add-transaction"
            variant="default"
            size="icon"
            class="max-md:min-h-11 max-md:min-w-11"
            :aria-label="$t('header.newTransaction')"
          >
            <PlusIcon class="size-4" aria-hidden="true" />
          </Button>
        </ManageTransactionDialog>

        <ManageTransactionDialog v-else>
          <Button variant="default" size="sm">
            <PlusIcon class="size-4" />
            {{ $t('header.newTransaction') }}
          </Button>
        </ManageTransactionDialog>

        <RouterLink :to="{ name: ROUTES_NAMES.settingsDataManagement }" class="max-md:hidden">
          <Button variant="secondary" size="sm">
            <ImportIcon class="size-4" />
            {{ $t('header.importData') }}
          </Button>
        </RouterLink>
      </div>

      <div class="ml-auto flex items-center gap-2">
        <template v-if="accountsNeedingRelink.length > 0">
          <AccountsRelinkWarning />
        </template>
        <template v-else>
          <Popover.Popover v-model:open="isPopoverOpen">
            <Popover.PopoverTrigger as-child>
              <Button
                variant="secondary"
                size="icon"
                class="max-md:min-h-11 max-md:min-w-11"
                :aria-label="syncButtonLabel"
              >
                <RefreshCcw v-if="syncStatus.isSyncing.value" class="animate-spin" :size="16" />
                <AlertTriangleIcon v-else-if="syncStatus.syncStuck.value" class="text-destructive-text" :size="16" />
                <SparklesIcon
                  v-else-if="categorizationStatus.isCategorizing.value"
                  class="text-primary-text animate-pulse"
                  :size="16"
                />
                <CloudCheckIcon v-else-if="hasConnections" class="text-success-text size-4" />
                <CloudCheckIcon v-else class="size-4" />
              </Button>
            </Popover.PopoverTrigger>
            <Popover.PopoverContent class="w-auto p-0" align="end">
              <SyncStatusTooltip
                :account-statuses="syncStatus.accountStatuses.value"
                :connections-needing-reauth="syncStatus.connectionsNeedingReauth.value"
                :sync-progress="syncStatus.syncProgress.value"
                :last-sync-timestamp="syncStatus.lastSyncTimestamp.value"
                :is-loading="syncStatus.isLoading.value"
                :is-syncing="syncStatus.isSyncing.value"
                :sync-stuck="syncStatus.syncStuck.value"
                :show-success-message="syncStatus.showSuccessMessage.value"
                :categorization-status="categorizationStatus.categorizationStatus.value"
                :is-categorizing="categorizationStatus.isCategorizing.value"
                :categorization-progress="categorizationStatus.progress.value"
                :categorization-just-completed="categorizationStatus.justCompleted.value"
                @trigger-sync="handleSyncClick"
              />
            </Popover.PopoverContent>
          </Popover.Popover>

          <SyncConfirmationDialog
            v-model:open="showConfirmDialog"
            :last-sync-timestamp="syncStatus.lastSyncTimestamp.value"
            @confirm="confirmSync"
          />
        </template>

        <NotificationsPopover />

        <RouterLink class="max-md:hidden" :to="{ name: ROUTES_NAMES.settings }">
          <DesktopOnlyTooltip :content="$t('header.settings')">
            <Button variant="secondary" size="icon" :aria-label="$t('header.settings')">
              <SettingsIcon class="size-4" />
            </Button>
          </DesktopOnlyTooltip>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AccountsRelinkWarning from '@/components/accounts-relink-warning.vue';
import DemoBanner from '@/components/demo/demo-banner.vue';
import ManageTransactionDialog from '@/components/dialogs/manage-transaction/index.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Popover from '@/components/lib/ui/popover';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import NotificationsPopover from '@/components/notifications-popover/index.vue';
import SyncConfirmationDialog from '@/components/sync-confirmation-dialog.vue';
import SyncStatusTooltip from '@/components/sync-status-tooltip.vue';
import { useCategorizationStatus } from '@/composable/use-categorization-status';
import { useCssVarFromElementSize } from '@/composable/use-css-var-from-element-size';
import { useDateLocale } from '@/composable/use-date-locale';
import { useIdleEnabled } from '@/composable/use-idle-enabled';
import { useSyncStatus } from '@/composable/use-sync-status';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAccountsStore } from '@/stores';
import {
  AlertTriangleIcon,
  CloudCheckIcon,
  ImportIcon,
  PlusIcon,
  RefreshCcw,
  SettingsIcon,
  SparklesIcon,
} from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';

const accountsStore = useAccountsStore();
const { accountsNeedingRelink, isAccountsFetched } = storeToRefs(accountsStore);

const { elementRef: headerRef } = useCssVarFromElementSize({
  cssVars: [{ cssVarName: '--header-height' }],
});

const { t } = useI18n();
const isMobileView = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile, { wait: 50 });
const showConfirmDialog = ref(false);
const isPopoverOpen = ref(false);

const syncStatus = useSyncStatus();

// AI categorization status
const categorizationStatus = useCategorizationStatus();

// Locale-aware date formatting
const { formatDistanceToNow } = useDateLocale();

const lastSyncRelativeTime = computed(() => {
  if (!syncStatus.lastSyncTimestamp.value) return null;
  return formatDistanceToNow(new Date(syncStatus.lastSyncTimestamp.value), { addSuffix: true });
});

const hasConnections = computed(() => syncStatus.accountStatuses.value.length > 0);

// Sync button is icon-only, so its meaning lives in the accessible name.
const syncButtonLabel = computed(() => {
  if (syncStatus.isSyncing.value) return t('header.sync.syncing');
  if (syncStatus.syncStuck.value) return t('header.sync.stuck');
  if (categorizationStatus.isCategorizing.value) return t('header.categorization.categorizing');
  if (hasConnections.value) {
    return lastSyncRelativeTime.value
      ? t('header.sync.syncedTime', { time: lastSyncRelativeTime.value })
      : t('header.sync.synchronizing');
  }
  return t('header.sync.synchronizing');
});

// Auto-check sync once accounts have loaded and no connection needs re-linking.
// Watch a derived boolean instead of the `accountsNeedingRelink` array: that
// computed yields a fresh reference on every accounts refetch and would re-fire
// this, whereas a boolean only fires on real transitions. Watching the combined
// flag also re-runs the check when a re-link is later resolved (false → true).
//
// Gated on `idleEnabled` so the auto-check POST + status refetch stay off the
// dashboard's critical path — the manual sync button and initial status query
// are untouched and still run eagerly.
const idleEnabled = useIdleEnabled();
const canAutoSync = computed(() => isAccountsFetched.value && accountsNeedingRelink.value.length === 0);
watch(
  [canAutoSync, idleEnabled],
  async ([ready, idle]) => {
    if (!ready || !idle) return;
    await syncStatus.checkAndAutoSync();
  },
  { immediate: true },
);

const handleSyncClick = async () => {
  // Check if confirmation is needed
  if (syncStatus.needsConfirmation.value) {
    // Close popover and show confirmation dialog
    isPopoverOpen.value = false;
    showConfirmDialog.value = true;
    return;
  }

  // No confirmation needed, trigger sync directly
  await syncStatus.triggerSync(true);
  // Keep popover open to show sync progress
};

const confirmSync = async () => {
  showConfirmDialog.value = false;
  await syncStatus.triggerSync(true); // Skip confirmation
  // Reopen popover to show sync progress
  isPopoverOpen.value = true;
};
</script>
