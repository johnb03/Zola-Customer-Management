<script setup>
import { useRoute } from 'vue-router'
import { usuario, showConfig } from '../store.js'

const route = useRoute()

const items = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    short: 'Dashboard',
    icon: [
      'M4 4h6.5v6.5H4z',
      'M13.5 4H20v4.5h-6.5z',
      'M4 13.5h4V20H4z',
      'M13.5 13.5H20V20h-6.5z',
    ],
  },
  {
    to: '/clientes',
    label: 'Clientes',
    short: 'Clientes',
    icon: [
      'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2',
      'M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
      'M17 11a4 4 0 1 0 0-8',
      'M21 21v-2a4 4 0 0 0-3-3.87',
    ],
  },
  {
    to: '/notas',
    label: 'Notas',
    short: 'Notas',
    icon: [
      'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z',
      'M14 2v6h6',
      'M16 13H8',
      'M16 17H8',
      'M10 9H8',
    ],
  },
  {
    to: '/visitas',
    label: 'Reporte de Visitas',
    short: 'Visitas',
    icon: [
      'M8 3h8a1 1 0 0 1 1 1v16H7V4a1 1 0 0 1 1-1Z',
      'M9 3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2H9V3Z',
      'M9.5 13.5 11 15l3-3.5',
    ],
  },
  {
    to: '/citas',
    label: 'Agendar Citas',
    short: 'Citas',
    icon: [
      'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14H4V6Z',
      'M4 10h16',
      'M8 4v3M16 4v3',
      'M8 15h.01M12 15h.01M16 15h.01',
    ],
  },
]

const isActive = (to) => route.path === to

const getInitials = (name) => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

const openConfig = () => {
  showConfig.value = true
}
</script>

<template>
  <aside class="sidebar">
    <!-- Brand -->
    <div class="brand">
      <div class="brand-logo-row">
        <div class="brand-logo-z">Z</div>
        <span class="brand-name">Zola</span>
      </div>
      <div class="brand-signature"></div>
    </div>

    <!-- Nav -->
    <nav class="nav">
      <router-link
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="nav-item"
        :class="{ active: isActive(item.to) }"
      >
        <div class="nav-bar"></div>
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path v-for="(d, i) in item.icon" :key="i" :d="d" />
        </svg>
        <span>{{ item.label }}</span>
      </router-link>
    </nav>

    <!-- Footer -->
    <div class="footer">
      <div class="footer-separator"></div>
      <div class="footer-inner">
        <div class="footer-user">
          <div v-if="usuario.foto" class="footer-avatar footer-avatar-photo">
            <img :src="usuario.foto" alt="Foto" />
          </div>
          <div v-else class="footer-avatar footer-avatar-initials">
            {{ getInitials(usuario.nombre) }}
          </div>
          <span class="footer-name">{{ usuario.nombre || 'Sin nombre' }}</span>
        </div>
        <button class="footer-settings" @click="openConfig" title="Configuración">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      </div>
    </div>
  </aside>

  <!-- Mobile tab bar -->
  <nav class="tab-bar">
    <router-link
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="tab-item"
      :class="{ active: isActive(item.to) }"
    >
      <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path v-for="(d, i) in item.icon" :key="i" :d="d" />
      </svg>
      <span>{{ item.short }}</span>
    </router-link>
    <button class="tab-item tab-settings" @click="openConfig">
      <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
      <span>Config</span>
    </button>
  </nav>
</template>

<style scoped>
.sidebar {
  width: 240px;
  flex-shrink: 0;
  height: 100vh;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border-right: 1px solid var(--border);
  padding: 28px 20px 20px;
}

/* Brand */
.brand {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 20px;
}

.brand-logo-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-logo-z {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--accent-gold);
  color: var(--bg-base);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Satoshi', sans-serif;
  font-size: 15px;
  font-weight: 900;
  line-height: 1;
}

.brand-name {
  font-family: 'Satoshi', sans-serif;
  font-size: 22px;
  font-weight: 900;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.brand-signature {
  width: 40px;
  height: 2px;
  border-radius: 1px;
  background: var(--accent-gold);
}

/* Nav */
.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  flex: 1;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  transition: color 120ms ease, background 120ms ease;
  text-decoration: none;
}

.nav-item:hover {
  color: var(--text-primary);
  background: var(--bg-surface);
}

.nav-item.active {
  color: var(--text-primary);
  font-weight: 700;
}

.nav-bar {
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 2px;
  background: var(--bg-elevated);
}

.nav-item.active .nav-bar {
  background: var(--accent-gold);
}

.nav-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* Footer */
.footer {
  margin-top: auto;
}

.footer-separator {
  height: 1px;
  background: var(--border);
  margin-bottom: 14px;
}

.footer-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.footer-user {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.footer-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.footer-avatar-initials {
  background: var(--bg-surface);
  color: var(--accent-gold);
  font-size: 12px;
  font-weight: 700;
}

.footer-avatar-photo {
  background: #5C4F3F;
}

.footer-avatar-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.footer-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.footer-settings {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary);
  transition: color 120ms ease, background 120ms ease;
  flex-shrink: 0;
  padding: 0;
}

.footer-settings svg {
  width: 18px;
  height: 18px;
}

.footer-settings:hover {
  color: var(--accent-gold);
  background: var(--bg-surface);
}

/* Mobile bottom tab bar */
.tab-bar {
  display: none;
}

@media (max-width: 768px) {
  .sidebar {
    display: none;
  }

  .tab-bar {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    background: var(--bg-elevated);
    border-top: 1px solid var(--border);
  }

  .tab-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    padding: 10px 0 12px;
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 500;
    text-decoration: none;
  }

  .tab-item span { display: none; }

  .tab-item.active {
    color: var(--accent-gold);
  }

  .tab-icon {
    width: 22px;
    height: 22px;
  }

  .tab-settings {
    border: none;
    background: none;
    cursor: pointer;
    font-family: inherit;
  }
}
</style>
