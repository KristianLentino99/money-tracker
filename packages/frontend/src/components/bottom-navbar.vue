<template>
  <div
    ref="navbarRef"
    data-testid="mobile-bottom-bar"
    class="bg-background/95 not-dark:border-border sticky right-0 bottom-0 left-0 z-[var(--z-navbar)] shrink-0 border-t pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md"
  >
    <MobileNavigation />

    <ManageTransactionDialog>
      <UiButton
        data-testid="mobile-add-transaction"
        variant="default"
        size="icon"
        class="border-background absolute -top-7 left-1/2 size-14 -translate-x-1/2 rounded-full border-4 shadow-lg"
        :aria-label="$t('mobileHubs.addTransaction')"
      >
        <PlusIcon class="size-6" aria-hidden="true" />
      </UiButton>
    </ManageTransactionDialog>
  </div>
</template>

<script setup lang="ts">
import ManageTransactionDialog from '@/components/dialogs/manage-transaction/index.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { useCssVarFromElementSize } from '@/composable/use-css-var-from-element-size';
import { PlusIcon } from '@lucide/vue';

import MobileNavigation from './mobile-navigation.vue';

const { elementRef: navbarRef } = useCssVarFromElementSize({
  cssVars: [
    { cssVarName: '--bottom-navbar-height', sizeSource: 'borderBoxSize' },
    { cssVarName: '--bottom-navbar-height-content-rect', sizeSource: 'contentRect' },
  ],
});
</script>
