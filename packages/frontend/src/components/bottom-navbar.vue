<template>
  <div
    ref="navbarRef"
    data-testid="mobile-bottom-bar"
    class="bg-background/95 not-dark:border-border sticky right-0 bottom-0 left-0 z-[var(--z-navbar)] shrink-0 border-t pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md"
  >
    <MobileNavigation />
  </div>
</template>

<script setup lang="ts">
import { useCssVarFromElementSize } from '@/composable/use-css-var-from-element-size';

import MobileNavigation from './mobile-navigation.vue';

const { elementRef: navbarRef } = useCssVarFromElementSize({
  cssVars: [
    { cssVarName: '--bottom-navbar-height', sizeSource: 'borderBoxSize' },
    { cssVarName: '--bottom-navbar-height-content-rect', sizeSource: 'contentRect' },
  ],
});
</script>
