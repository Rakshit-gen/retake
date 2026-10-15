import { useEffect } from 'react'
import { View } from 'react-native'
import { Banner, Button, color, Row, Screen, space, Text } from '@retake/ui'
import { useRider } from '../context'

export function PickupsScreen() {
  const pickups = useRider((s) => s.pickups)
  const loading = useRider((s) => s.loading)
  const error = useRider((s) => s.error)
  const load = useRider((s) => s.load)
  const open = useRider((s) => s.open)

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Screen title="Return pickups" footer={<Button kind="plain" label="Refresh" onPress={() => void load()} busy={loading} />}>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {!loading && !error && pickups.length === 0 ? <Text style={{ color: color.inkSoft }}>No pickups right now.</Text> : null}
      <View style={{ gap: space(1) }}>
        {pickups.map((p) => (
          <Row
            key={p.id}
            testID={`pickup-${p.id}`}
            title={p.itemName}
            detail={`Order ${p.orderId} · ${p.attempts.length === 0 ? 'not started' : `${p.attempts.length} photo sets sent`}`}
            onPress={() => open(p)}
          />
        ))}
      </View>
    </Screen>
  )
}
