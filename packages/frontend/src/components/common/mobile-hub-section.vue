<template>
  <section class="@container/mobile-hub-section space-y-3">
    <div>
      <h2 class="text-muted-foreground text-xs font-semibold tracking-[0.14em] uppercase">{{ title }}</h2>
      <p v-if="description" class="text-muted-foreground mt-1 text-sm leading-6">{{ description }}</p>
    </div>

    <div class="grid grid-cols-1 gap-3 @sm/mobile-hub-section:grid-cols-2">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>
