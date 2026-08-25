<template>
  <nav
    data-testid="mobile-primary-navigation"
    :aria-label="t('navigation.dashboard')"
    class="grid min-w-0 grid-cols-5 gap-0.5"
  >
    <RouterLink
      v-for="tab in MOBILE_PRIMARY_NAVIGATION"
      :key="tab.key"
      v-slot="{ isActive: isExactRouteActive }"
      :to="{ name: tab.routeName }"
      class="flex min-w-0"
      :data-mobile-tab="tab.key"
    >
      <UiButton
        variant="ghost"
        as="span"
        class="min-h-11 w-full min-w-0 flex-col gap-0.5 rounded-md px-0.5 py-1.5 text-[10px] leading-4"
        :class="[
          isExactRouteActive || isMobileTabActive({ tab: tab.key, routeName: route.name })
            ? 'bg-primary/10 text-foreground'
            : 'text-muted-foreground',
        ]"
        :aria-label="t(tab.labelKey)"
        :aria-current="
          isExactRouteActive || isMobileTabActive({ tab: tab.key, routeName: route.name }) ? 'page' : undefined
        "
      >
        <component
          :is="icons[tab.key]"
          class="size-5 shrink-0"
          :class="
            isExactRouteActive || isMobileTabActive({ tab: tab.key, routeName: route.name })
              ? 'text-primary-text'
              : 'text-muted-foreground'
          "
          aria-hidden="true"
        />
        <span class="max-w-full truncate whitespace-nowrap">{{ t(tab.labelKey) }}</span>
      </UiButton>
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import { isMobileTabActive, MOBILE_PRIMARY_NAVIGATION, type MobilePrimaryTab } from '@/common/utils/mobile-navigation';
import { ChartColumnIcon, CreditCardIcon, LayersIcon, MoreHorizontalIcon, WalletIcon } from '@lucide/vue';
import type { Component } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, useRoute } from 'vue-router';

const { t } = useI18n();
const route = useRoute();

const icons: Record<MobilePrimaryTab, Component> = {
  home: ChartColumnIcon,
  plan: WalletIcon,
  transactions: CreditCardIcon,
  accounts: LayersIcon,
  more: MoreHorizontalIcon,
};
</script>
