<template>
  <header class="flex min-w-0 items-start justify-between gap-4">
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">{{ title }}</h1>
      <p v-if="description" class="text-muted-foreground mt-1 max-w-2xl text-sm leading-6">
        {{ description }}
      </p>
    </div>

    <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>
