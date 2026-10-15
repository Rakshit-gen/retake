import { combineReducers, configureStore } from '@reduxjs/toolkit'
import createSagaMiddleware from 'redux-saga'
import { claim } from './claim'
import { orders } from './orders'
import { rootSaga, type SagaDeps } from './sagas'

export const reducer = combineReducers({ orders: orders.reducer, claim: claim.reducer })
export type RootState = ReturnType<typeof reducer>

export function makeStore(deps: SagaDeps) {
  const saga = createSagaMiddleware({ context: { ...deps } })
  const store = configureStore({ reducer, middleware: (gdm) => gdm({ thunk: false }).concat(saga) })
  saga.run(rootSaga)
  return store
}

export type AppStore = ReturnType<typeof makeStore>
export type AppDispatch = AppStore['dispatch']
export { claim, orders }
