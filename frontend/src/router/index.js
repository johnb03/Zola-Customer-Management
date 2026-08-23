import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import VisitasView from '../views/VisitasView.vue'
import ClientesView from '../views/ClientesView.vue'
import CitasView from '../views/CitasView.vue'
import DatosView from '../views/DatosView.vue'
import NotasView from '../views/NotasView.vue'

const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'dashboard', component: DashboardView },
  { path: '/visitas', name: 'visitas', component: VisitasView },
  { path: '/clientes', name: 'clientes', component: ClientesView },
  { path: '/citas', name: 'citas', component: CitasView },
  { path: '/datos', name: 'datos', component: DatosView },
  { path: '/notas', name: 'notas', component: NotasView },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
