<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui.store'
import { AlertTriangle, Info, X, Trash2 } from 'lucide-vue-next'

const uiStore = useUiStore()

const currentRequest = computed(() => uiStore.currentConfirmRequest)

const iconComponent = computed(() => {
  const variant = currentRequest.value?.variant
  if (variant === 'danger') return Trash2
  if (variant === 'warning') return AlertTriangle
  return Info
})

function close(result: boolean) {
  uiStore.closeConfirmDialog(result)
}
</script>

<template>
  <Transition name="confirm-fade">
    <div v-if="currentRequest" class="confirm-mask" @click.self="close(false)">
      <div class="confirm-dialog" :class="`variant-${currentRequest.variant || 'info'}`" role="alertdialog" aria-modal="true">
        <button class="confirm-close" @click="close(false)" aria-label="关闭">
          <X :size="16" />
        </button>

        <div class="confirm-icon-wrap">
          <component :is="iconComponent" :size="22" class="confirm-icon" />
        </div>

        <h3 class="confirm-title">{{ currentRequest.title }}</h3>
        <p v-if="currentRequest.message" class="confirm-message">{{ currentRequest.message }}</p>
        <div v-if="currentRequest.detail" class="confirm-detail">{{ currentRequest.detail }}</div>

        <div class="confirm-actions">
          <button class="confirm-btn cancel" @click="close(false)">
            {{ currentRequest.cancelText || '取消' }}
          </button>
          <button
            class="confirm-btn primary"
            :class="{ danger: (currentRequest.variant || 'info') === 'danger' }"
            @click="close(true)"
          >
            {{ currentRequest.confirmText || '确定' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.confirm-mask {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.confirm-dialog {
  position: relative;
  width: 100%;
  max-width: 420px;
  background: #ffffff;
  color: #0f172a;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 16px;
  padding: 32px 28px 24px;
  box-shadow:
    0 24px 48px rgba(0, 0, 0, 0.18),
    0 4px 12px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  font-family: inherit;
}

[data-theme='dark'] .confirm-mask {
  background: rgba(0, 0, 0, 0.6);
}

[data-theme='dark'] .confirm-dialog {
  background: #1e1f22;
  color: #f5f5f7;
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow:
    0 24px 48px rgba(0, 0, 0, 0.5),
    0 4px 12px rgba(0, 0, 0, 0.3);
}

.confirm-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.confirm-close:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #0f172a;
}

[data-theme='dark'] .confirm-close {
  color: #94a3b8;
}

[data-theme='dark'] .confirm-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f5f5f7;
}

.confirm-icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 18px;
}

.variant-info .confirm-icon-wrap {
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
}

.variant-warning .confirm-icon-wrap {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}

.variant-danger .confirm-icon-wrap {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.confirm-title {
  margin: 0 0 10px;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #0f172a;
}

[data-theme='dark'] .confirm-title {
  color: #f5f5f7;
}

.confirm-message {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.55;
  color: #475569;
  white-space: pre-line;
  word-break: break-word;
  max-width: 100%;
}

[data-theme='dark'] .confirm-message {
  color: #cbd5e1;
}

.confirm-detail {
  margin: 0 0 4px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 8px;
  font-size: 12.5px;
  line-height: 1.5;
  color: #64748b;
  max-width: 100%;
  word-break: break-word;
}

[data-theme='dark'] .confirm-detail {
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
}

.confirm-actions {
  display: flex;
  gap: 10px;
  width: 100%;
  margin-top: 22px;
}

.confirm-btn {
  flex: 1;
  height: 38px;
  padding: 0 16px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
  font-family: inherit;
}

.confirm-btn.cancel {
  background: transparent;
  border-color: rgba(0, 0, 0, 0.12);
  color: #0f172a;
}

.confirm-btn.cancel:hover {
  background: rgba(0, 0, 0, 0.05);
}

[data-theme='dark'] .confirm-btn.cancel {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
  color: #f5f5f7;
}

[data-theme='dark'] .confirm-btn.cancel:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.confirm-btn.primary {
  background: #3b82f6;
  color: #fff;
  border-color: #3b82f6;
}

.confirm-btn.primary:hover {
  background: #2563eb;
  border-color: #2563eb;
}

.confirm-btn.primary.danger {
  background: #ef4444;
  border-color: #ef4444;
}

.confirm-btn.primary.danger:hover {
  background: #dc2626;
  border-color: #dc2626;
}

/* 动画 */
.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.2s ease;
}

.confirm-fade-enter-active .confirm-dialog,
.confirm-fade-leave-active .confirm-dialog {
  transition:
    opacity 0.2s ease,
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}

.confirm-fade-enter-from .confirm-dialog,
.confirm-fade-leave-to .confirm-dialog {
  opacity: 0;
  transform: scale(0.96) translateY(8px);
}
</style>
