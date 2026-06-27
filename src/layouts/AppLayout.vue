<script setup lang="ts">
import AppSidebar from '@/components/AppSidebar.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import TaskDrawer from '@/components/TaskDrawer.vue'
import { useUiStore } from '@/stores/ui.store'

const uiStore = useUiStore()
</script>

<template>
  <div
    class="app-layout"
    :class="{
      'sidebar-collapsed': uiStore.sidebarCollapsed,
      'drawer-open': uiStore.drawerOpen,
    }"
  >
    <AppSidebar />
    <div class="main-area">
      <AppTopbar />
      <main class="content">
        <router-view />
      </main>
    </div>
    <TaskDrawer v-if="uiStore.drawerOpen" />
  </div>
</template>

<style scoped>
.app-layout {
  height: 100%;
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  transition: grid-template-columns var(--duration-base) var(--ease-out);
  will-change: grid-template-columns;
  background:
    radial-gradient(circle at top, color-mix(in srgb, var(--accent) 10%, transparent), transparent 26%),
    linear-gradient(180deg, var(--canvas), var(--bg));
  color: var(--text);
}

.app-layout.sidebar-collapsed {
  grid-template-columns: var(--sidebar-collapsed) 1fr;
}

.app-layout.drawer-open {
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr) 380px;
}

.app-layout.sidebar-collapsed.drawer-open {
  grid-template-columns: var(--sidebar-collapsed) minmax(0, 1fr) 380px;
}

.main-area {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}
</style>
