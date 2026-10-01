import { config } from '@/common/config';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { computed } from 'vue';

/**
 * Shared read/write access to the header "Support" (donation) button visibility.
 * Used by both the header and appearance settings so the two stay in sync.
 * Defaults to visible when the user has no stored preference.
 */
export const useSupportButton = () => {
  const { data: userSettings, patchAsync, isPatching } = useUserSettings();

  const isSupportButtonAvailable = computed(() => config.isSelfHost);

  const isSupportButtonVisible = computed(
    () => isSupportButtonAvailable.value && (userSettings.value?.showSupportButton ?? true),
  );

  const setSupportButtonVisible = (value: boolean) => patchAsync({ showSupportButton: value });

  return { isSupportButtonAvailable, isSupportButtonVisible, setSupportButtonVisible, isUpdating: isPatching };
};
