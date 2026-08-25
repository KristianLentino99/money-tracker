import { useVersionCheck } from '@/composable/use-version-check';
import { activatePwaUpdate, checkForPwaUpdate, pwaState } from '@/lib/pwa';
import { computed } from 'vue';

export const useAppUpdate = () => {
  const { isStale } = useVersionCheck();
  const isUpdateAvailable = computed(() => isStale.value || pwaState.needRefresh.value);

  const applyUpdate = async () => {
    await checkForPwaUpdate();

    if (pwaState.needRefresh.value) {
      await activatePwaUpdate();
      return;
    }

    window.location.reload();
  };

  return {
    applyUpdate,
    isUpdateAvailable,
  };
};
