<script setup lang="ts">
import AppSidebar from '@/components/AppSidebar.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import { useUiStore } from '@/stores/ui.store'

const uiStore = useUiStore()
</script>

<template>
  <div class="app-layout" :class="{ 'sidebar-collapsed': uiStore.sidebarCollapsed }">
    <AppSidebar />
    <div class="main-area">
      <AppTopbar />
      <main class="content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-layout {
  height: 100%;
  display: grid;
  grid-template-columns: 360px 1fr;
  transition: grid-template-columns 0.25s ease;
  background: var(--bg);
  color: var(--text);
}

.app-layout.sidebar-collapsed {
  grid-template-columns: 96px 1fr;
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
