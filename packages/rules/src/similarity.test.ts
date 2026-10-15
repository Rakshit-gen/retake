import { compareToClaim } from './similarity'

describe('compareToClaim', () => {
  const claim = ['ffff0000ffff0000', '0f0f0f0f0f0f0f0f']

  it('uses the closest claim photo', () => {
    expect(compareToClaim('ffff0000ffff0001', claim).distance).toBe(1)
  })

  it('warns when the live frame is far from every claim photo', () => {
    expect(compareToClaim('0000ffff0000ffff', claim, { warnAbove: 20 })).toEqual({ distance: 32, warn: true })
  })

  it('does not warn for a near copy', () => {
    expect(compareToClaim('ffff0000ffff0003', claim, { warnAbove: 20 }).warn).toBe(false)
  })

  it('never warns when there is nothing to compare against', () => {
    expect(compareToClaim('ffff0000ffff0000', [])).toEqual({ distance: null, warn: false })
  })
})
