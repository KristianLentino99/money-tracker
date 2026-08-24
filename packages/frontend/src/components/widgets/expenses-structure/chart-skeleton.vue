<template>
  <div class="relative flex h-55 w-full items-center justify-center" role="status">
    <span class="sr-only">{{ $t('common.loading') }}</span>
    <div class="bg-muted/60 flex size-44 animate-pulse items-center justify-center rounded-full">
      <div class="bg-card flex size-28 items-center justify-center rounded-full">
        <div class="bg-muted h-3 w-16 rounded" />
      </div>
    </div>
  </div>
</template>
