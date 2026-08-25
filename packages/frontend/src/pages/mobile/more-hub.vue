<template>
  <PageWrapper>
    <div class="mx-auto max-w-4xl space-y-8">
      <MobilePageHeader :title="$t('mobileHubs.more.title')" :description="$t('mobileHubs.more.description')" />

      <MobileHubSection :title="$t('navigation.analytics')">
        <MobileNavCard
          :to="{ name: ROUTES_NAMES.analytics }"
          :title="$t('navigation.analytics')"
          :icon="ChartColumnIcon"
        />
      </MobileHubSection>

      <MobileHubSection :title="$t('navigation.planned.planned')">
        <MobileNavCard
          :to="{ name: ROUTES_NAMES.planned }"
          :title="$t('navigation.planned.planned')"
          :icon="CalendarClockIcon"
        />
      </MobileHubSection>

      <MobileHubSection :title="$t('navigation.transactions')">
        <MobileNavCard
          :to="{ name: ROUTES_NAMES.transactionGroups }"
          :title="$t('navigation.transactionGroups')"
          :icon="GroupIcon"
        />
        <MobileNavCard
          :to="{ name: ROUTES_NAMES.optimizations }"
          :title="$t('navigation.optimizations')"
          :icon="WrenchIcon"
        />
        <MobileNavCard :to="{ name: ROUTES_NAMES.automations }" :title="$t('navigation.automations')" :icon="ZapIcon" />
      </MobileHubSection>

      <MobileHubSection :title="$t('settings.navigation.workspaceGroup')">
        <MobileNavCard :to="{ name: ROUTES_NAMES.settings }" :title="$t('header.settings')" :icon="SettingsIcon" />
        <MobileNavCard
          :to="{ name: ROUTES_NAMES.settingsDataManagement }"
          :title="$t('settings.navigation.importData')"
          :icon="UploadIcon"
        />
        <MobileNavCard
          :to="{ name: ROUTES_NAMES.settingsSharedWithMe }"
          :title="$t('settings.navigation.sharedWithMe')"
          :icon="UsersIcon"
        />
        <MobileNavCard
          :to="{ name: ROUTES_NAMES.settingsHousehold }"
          :title="$t('settings.navigation.household')"
          :icon="HomeIcon"
        />
        <MobileNavCard
          v-if="isAdmin"
          :to="{ name: ROUTES_NAMES.settingsAdmin }"
          :title="$t('settings.navigation.admin')"
          :icon="ShieldIcon"
        />
      </MobileHubSection>
    </div>
  </PageWrapper>
</template>

<script setup lang="ts">
import MobileHubSection from '@/components/common/mobile-hub-section.vue';
import MobileNavCard from '@/components/common/mobile-nav-card.vue';
import MobilePageHeader from '@/components/common/mobile-page-header.vue';
import PageWrapper from '@/components/common/page-wrapper.vue';
import { useIsAdmin } from '@/composable/use-is-admin';
import { ROUTES_NAMES } from '@/routes';
import {
  CalendarClockIcon,
  ChartColumnIcon,
  GroupIcon,
  HomeIcon,
  SettingsIcon,
  ShieldIcon,
  UploadIcon,
  UsersIcon,
  WrenchIcon,
  ZapIcon,
} from '@lucide/vue';

const { isAdmin } = useIsAdmin();
</script>
