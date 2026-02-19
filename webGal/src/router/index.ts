import { createMemoryHistory, createRouter } from 'vue-router'
import PlayView from '../views/play/indexView.vue'

const routes = [
  { path: '/', redirect: '/play' },
  { path: '/play', component: PlayView }
]

const router = createRouter({
  history: createMemoryHistory(),
  routes
})

export default router
