import { useEffect } from 'react'
import { View } from 'react-native'
import { Banner, Button, Row, Screen, space, Text, color } from '@retake/ui'
import { rupees } from '../api'
import { useAppDispatch, useAppSelector } from '../hooks'
import { claim, orders } from '../store'

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export function OrdersScreen({ onReport }: { onReport: () => void }) {
  const dispatch = useAppDispatch()
  const { list, status, error } = useAppSelector((s) => s.orders)
  const submit = useAppSelector((s) => s.claim.submit)

  useEffect(() => {
    dispatch(orders.actions.requested())
  }, [dispatch])

  const uploading = submit.state === 'queued' || submit.state === 'running' || submit.state === 'retrying'

  return (
    <Screen title="Your orders">
      {uploading ? <Banner tone="info">A claim is still uploading. It will finish on its own once you are online.</Banner> : null}
      {status === 'failed' ? (
        <View style={{ gap: space(2) }}>
          <Banner tone="bad">{error ?? 'Could not load orders.'}</Banner>
          <Button kind="plain" label="Try again" onPress={() => dispatch(orders.actions.requested())} />
        </View>
      ) : null}
      {status === 'loading' && list.length === 0 ? <Text style={{ color: color.inkSoft }}>Loading orders…</Text> : null}
      {list.map((o) => (
        <View key={o.id}>
          <Text variant="label" style={{ marginBottom: space(2) }}>
            {dateFmt.format(new Date(o.placedAt))} · {o.address}
          </Text>
          {o.items.map((it) => (
            <Row
              key={it.id}
              testID={`item-${it.id}`}
              title={it.name}
              detail={`${it.qty} x ${rupees(it.pricePaise)} · Report a problem`}
              onPress={() => {
                dispatch(claim.actions.started({ orderId: o.id, itemId: it.id }))
                onReport()
              }}
            />
          ))}
        </View>
      ))}
    </Screen>
  )
}
