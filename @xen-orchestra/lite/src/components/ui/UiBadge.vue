<template>
  <span class="ui-badge">
    <UiIcon :icon />
    <slot />
  </span>
</template>

<script lang="ts" setup>
import type { IconDefinition } from '@fortawesome/fontawesome-common-types'
import UiIcon from '@/components/ui/icon/UiIcon.vue'

defineProps<{
  icon?: IconDefinition
}>()
</script>

<style lang="postcss" scoped>
.ui-badge {
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 1.4rem;
  font-weight: 500;
  padding: 0 0.8rem;
  height: 1.8em;
  color: var(--color-grey-600);
  border-radius: 9.6rem;
  background-color: var(--color-grey-300);
}
</style>
