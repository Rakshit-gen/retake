import { render, screen, userEvent } from '@testing-library/react-native'
import { useState } from 'react'
import { Banner, Button, Choices, Row } from './index'

test('a disabled button does not fire', async () => {
  const onPress = jest.fn()
  await render(<Button label="Submit claim" onPress={onPress} disabled />)
  await userEvent.setup().press(screen.getByRole('button', { name: 'Submit claim' }))
  expect(onPress).not.toHaveBeenCalled()
  expect(screen.getByRole('button')).toBeDisabled()
})

test('a busy button shows a spinner and reports busy', async () => {
  await render(<Button label="Uploading" onPress={() => {}} busy />)
  expect(screen.queryByText('Uploading')).toBeNull()
  expect(screen.getByRole('button')).toBeBusy()
})

test('choices behave as a radio group', async () => {
  function Pick() {
    const [v, setV] = useState<'a' | 'b' | null>(null)
    return <Choices options={[{ value: 'a', label: 'Wrong item' }, { value: 'b', label: 'Expired' }]} value={v} onChange={setV} />
  }
  await render(<Pick />)
  await userEvent.setup().press(screen.getByRole('radio', { name: 'Expired' }))
  expect(screen.getByRole('radio', { name: 'Expired' })).toBeChecked()
  expect(screen.getByRole('radio', { name: 'Wrong item' })).not.toBeChecked()
})

test('a row without onPress is not announced as a button', async () => {
  await render(<Row title="Atta 5 kg" detail="1 x Rs 245" />)
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.getByText('1 x Rs 245')).toBeOnTheScreen()
})

test('a banner is a live region so TalkBack reads hint changes', async () => {
  await render(<Banner tone="warn" testID="hint">Too dark. Find more light.</Banner>)
  expect(screen.getByTestId('hint').props.accessibilityLiveRegion).toBe('polite')
})
