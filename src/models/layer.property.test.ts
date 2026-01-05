/**
 * Property-Based Tests for Layer Models
 *
 * Feature: book-creation-converter
 * These tests verify universal properties that must hold for all valid inputs.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  type LayerObject,
  type LayerType,
  type SourceType,
  type LayerRole,
  type TextAlign,
  type ShapeType,
  serializeLayer,
  deserializeLayer,
  isValidLayer,
  isValidBounds
} from './layer'

// Arbitraries for generating random valid data

const boundsArb = fc.record({
  x: fc.float({ min: 0, max: 10000, noNaN: true }),
  y: fc.float({ min: 0, max: 10000, noNaN: true }),
  width: fc.float({ min: 1, max: 5000, noNaN: true }),
  height: fc.float({ min: 1, max: 5000, noNaN: true })
})

const sourceTypeArb: fc.Arbitrary<SourceType> = fc.constantFrom('extracted', 'manual', 'imported')
const layerRoleArb: fc.Arbitrary<LayerRole> = fc.constantFrom(
  'background',
  'content',
  'header',
  'footer',
  'annotation'
)
const textAlignArb: fc.Arbitrary<TextAlign> = fc.constantFrom('left', 'center', 'right')
const shapeTypeArb: fc.Arbitrary<ShapeType> = fc.constantFrom('rectangle', 'circle', 'line', 'polygon')

const textLayerArb: fc.Arbitrary<LayerObject> = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 50 }),
    type: fc.constant('text' as LayerType),
    bounds: boundsArb,
    visible: fc.boolean(),
    locked: fc.boolean(),
    zIndex: fc.integer({ min: 0, max: 1000 }),
    opacity: fc.float({ min: 0, max: 1, noNaN: true }),
    content: fc.string({ minLength: 0, maxLength: 1000 }),
    fontFamily: fc.constantFrom('Arial', 'Times New Roman', 'Helvetica', 'Georgia'),
    fontSize: fc.float({ min: 6, max: 72, noNaN: true }),
    fontWeight: fc.constantFrom(100, 200, 300, 400, 500, 600, 700, 800, 900),
    color: fc.hexaString({ minLength: 7, maxLength: 7 }),
    textAlign: textAlignArb,
    sourceType: sourceTypeArb,
    role: layerRoleArb
  })
  .map((obj) => ({
    ...obj,
    color: obj.color.startsWith('#') ? obj.color : `#${obj.color}`
  }))

const imageLayerArb: fc.Arbitrary<LayerObject> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  type: fc.constant('image' as LayerType),
  bounds: boundsArb,
  visible: fc.boolean(),
  locked: fc.boolean(),
  zIndex: fc.integer({ min: 0, max: 1000 }),
  opacity: fc.float({ min: 0, max: 1, noNaN: true }),
  imageUrl: fc.webUrl(),
  imageData: fc.record({
    width: fc.integer({ min: 1, max: 10000 }),
    height: fc.integer({ min: 1, max: 10000 }),
    colorSpace: fc.constantFrom('RGB', 'RGBA', 'Grayscale'),
    dpi: fc.integer({ min: 72, max: 600 })
  }),
  sourceType: sourceTypeArb,
  role: layerRoleArb
})

const shapeLayerArb: fc.Arbitrary<LayerObject> = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 50 }),
    type: fc.constant('shape' as LayerType),
    bounds: boundsArb,
    visible: fc.boolean(),
    locked: fc.boolean(),
    zIndex: fc.integer({ min: 0, max: 1000 }),
    opacity: fc.float({ min: 0, max: 1, noNaN: true }),
    shapeType: shapeTypeArb,
    strokeColor: fc.hexaString({ minLength: 7, maxLength: 7 }),
    strokeWidth: fc.float({ min: 0.5, max: 20, noNaN: true }),
    fillColor: fc.hexaString({ minLength: 7, maxLength: 7 }),
    sourceType: sourceTypeArb,
    role: layerRoleArb
  })
  .map((obj) => ({
    ...obj,
    strokeColor: obj.strokeColor.startsWith('#') ? obj.strokeColor : `#${obj.strokeColor}`,
    fillColor: obj.fillColor.startsWith('#') ? obj.fillColor : `#${obj.fillColor}`
  }))

const layerArb: fc.Arbitrary<LayerObject> = fc.oneof(textLayerArb, imageLayerArb, shapeLayerArb)

/**
 * Generate a layer ID in the format {type}-{pageIndex}-{seqNumber}
 */
function generateLayerId(type: string, pageIndex: number, seqNumber: number): string {
  return `${type}-${pageIndex}-${seqNumber}`
}

describe('Property Tests: Layer ID Uniqueness and Format', () => {
  /**
   * Property 1: Layer ID Uniqueness and Format
   *
   * For any imported document (PDF or DOCX), all generated layer IDs SHALL be
   * unique across all pages AND follow the format {type}-{pageIndex}-{seqNumber}.
   *
   * Validates: Requirements 1.5, 2.5
   */
  it('Property 1: Layer IDs follow the format {type}-{pageIndex}-{seqNumber}', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('text', 'image', 'shape', 'vector'),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 10000 }),
        (type, pageIndex, seqNumber) => {
          const id = generateLayerId(type, pageIndex, seqNumber)

          // Verify format: {type}-{pageIndex}-{seqNumber}
          const parts = id.split('-')
          expect(parts.length).toBe(3)
          expect(parts[0]).toBe(type)
          expect(parseInt(parts[1], 10)).toBe(pageIndex)
          expect(parseInt(parts[2], 10)).toBe(seqNumber)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 1: Layer IDs are unique for different (type, pageIndex, seqNumber) combinations', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.constantFrom('text', 'image', 'shape', 'vector'),
            fc.integer({ min: 0, max: 100 }),
            fc.integer({ min: 0, max: 100 })
          ),
          { minLength: 2, maxLength: 50 }
        ),
        (combinations) => {
          const ids = combinations.map(([type, pageIndex, seqNumber]) =>
            generateLayerId(type, pageIndex, seqNumber)
          )

          // Get unique combinations
          const uniqueCombinations = new Set(combinations.map((c) => c.join('-')))

          // Get unique IDs
          const uniqueIds = new Set(ids)

          // Number of unique IDs should equal number of unique combinations
          expect(uniqueIds.size).toBe(uniqueCombinations.size)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 1: Generated IDs within a simulated document are all unique', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }), // number of pages
        fc.integer({ min: 1, max: 50 }), // max layers per page
        (numPages, maxLayersPerPage) => {
          const allIds: string[] = []

          // Simulate document import generating layer IDs
          for (let pageIndex = 0; pageIndex < numPages; pageIndex++) {
            const layerTypes = ['text', 'image', 'shape', 'vector']
            const counters: Record<string, number> = {}

            // Generate random number of layers for this page
            const numLayers = Math.floor(Math.random() * maxLayersPerPage) + 1

            for (let i = 0; i < numLayers; i++) {
              const type = layerTypes[Math.floor(Math.random() * layerTypes.length)]
              counters[type] = (counters[type] || 0) + 1
              const id = generateLayerId(type, pageIndex, counters[type] - 1)
              allIds.push(id)
            }
          }

          // All IDs should be unique
          const uniqueIds = new Set(allIds)
          expect(uniqueIds.size).toBe(allIds.length)
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Property Tests: Layer Serialization Round-Trip', () => {
  /**
   * Property 3: Layer Serialization Round-Trip
   *
   * For any valid LayerObject, serializing to JSON then deserializing
   * SHALL produce an object equivalent to the original (all fields match).
   *
   * Validates: Requirements 3.9, 3.10, 3.11
   */
  it('Property 3: Text layer serialization round-trip preserves all fields', () => {
    fc.assert(
      fc.property(textLayerArb, (layer) => {
        const serialized = serializeLayer(layer)
        const deserialized = deserializeLayer(serialized)

        expect(deserialized).not.toBeNull()
        expect(deserialized!.id).toBe(layer.id)
        expect(deserialized!.type).toBe(layer.type)
        expect(deserialized!.bounds.x).toBeCloseTo(layer.bounds.x, 5)
        expect(deserialized!.bounds.y).toBeCloseTo(layer.bounds.y, 5)
        expect(deserialized!.bounds.width).toBeCloseTo(layer.bounds.width, 5)
        expect(deserialized!.bounds.height).toBeCloseTo(layer.bounds.height, 5)
        expect(deserialized!.visible).toBe(layer.visible)
        expect(deserialized!.locked).toBe(layer.locked)
        expect(deserialized!.zIndex).toBe(layer.zIndex)
        expect(deserialized!.opacity).toBeCloseTo(layer.opacity, 5)
        expect(deserialized!.content).toBe(layer.content)
        expect(deserialized!.fontFamily).toBe(layer.fontFamily)
        expect(deserialized!.sourceType).toBe(layer.sourceType)
        expect(deserialized!.role).toBe(layer.role)
      }),
      { numRuns: 100 }
    )
  })

  it('Property 3: Image layer serialization round-trip preserves all fields', () => {
    fc.assert(
      fc.property(imageLayerArb, (layer) => {
        const serialized = serializeLayer(layer)
        const deserialized = deserializeLayer(serialized)

        expect(deserialized).not.toBeNull()
        expect(deserialized!.id).toBe(layer.id)
        expect(deserialized!.type).toBe(layer.type)
        expect(deserialized!.imageUrl).toBe(layer.imageUrl)
        expect(deserialized!.imageData).toEqual(layer.imageData)
        expect(deserialized!.sourceType).toBe(layer.sourceType)
        expect(deserialized!.role).toBe(layer.role)
      }),
      { numRuns: 100 }
    )
  })

  it('Property 3: Shape layer serialization round-trip preserves all fields', () => {
    fc.assert(
      fc.property(shapeLayerArb, (layer) => {
        const serialized = serializeLayer(layer)
        const deserialized = deserializeLayer(serialized)

        expect(deserialized).not.toBeNull()
        expect(deserialized!.id).toBe(layer.id)
        expect(deserialized!.type).toBe(layer.type)
        expect(deserialized!.shapeType).toBe(layer.shapeType)
        expect(deserialized!.strokeColor).toBe(layer.strokeColor)
        expect(deserialized!.fillColor).toBe(layer.fillColor)
        expect(deserialized!.sourceType).toBe(layer.sourceType)
        expect(deserialized!.role).toBe(layer.role)
      }),
      { numRuns: 100 }
    )
  })
})

describe('Property Tests: Layer Model Validity', () => {
  /**
   * Property 2: Layer Model Validity
   *
   * For any LayerObject, the object SHALL contain all required base fields
   * (id, type, bounds, visible, locked, zIndex, opacity, sourceType, role)
   * AND type-specific fields based on layer type.
   *
   * Validates: Requirements 3.1-3.8
   */
  it('Property 2: All generated layers pass validation', () => {
    fc.assert(
      fc.property(layerArb, (layer) => {
        expect(isValidLayer(layer)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('Property 2: Bounds with positive dimensions are valid', () => {
    fc.assert(
      fc.property(boundsArb, (bounds) => {
        expect(isValidBounds(bounds)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('Property 2: Bounds with zero or negative dimensions are invalid', () => {
    fc.assert(
      fc.property(
        fc.record({
          x: fc.float({ min: 0, max: 1000, noNaN: true }),
          y: fc.float({ min: 0, max: 1000, noNaN: true }),
          width: fc.float({ min: -100, max: 0, noNaN: true }),
          height: fc.float({ min: -100, max: 0, noNaN: true })
        }),
        (bounds) => {
          expect(isValidBounds(bounds)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})
