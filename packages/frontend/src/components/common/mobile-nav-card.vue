<template>
  <RouterLink :to="to" class="group block min-w-0" :aria-label="title">
    <Card
      as="div"
      class="group-hover:bg-accent group-focus-visible:ring-ring flex min-h-18 items-center gap-3 p-3 transition-colors group-focus-visible:ring-2 group-focus-visible:outline-none"
    >
      <span class="bg-primary/10 text-primary-text flex size-11 shrink-0 items-center justify-center rounded-xl">
        <component :is="icon" class="size-5" aria-hidden="true" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="text-foreground block truncate text-sm font-semibold">{{ title }}</span>
        <span v-if="description" class="text-muted-foreground mt-0.5 block text-xs leading-5">{{ description }}</span>
      </span>
      <ChevronRightIcon class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
    </Card>
  </RouterLink>
</template>

<script setup lang="ts">
import { Card } from '@/components/lib/ui/card';
import type { Component } from 'vue';
import { ChevronRightIcon } from '@lucide/vue';
import type { RouteLocationRaw } from 'vue-router';
import { RouterLink } from 'vue-router';

defineProps<{
  to: RouteLocationRaw;
  title: string;
  description?: string;
  icon: Component;
}>();
</script>
