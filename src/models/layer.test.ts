/**
 * Layer Model Tests
 *
 * Unit tests and property-based tests for layer data models.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  createBounds,
  createDefaultMetadata,
  createDefaultSettings,
  createEmptyProject,
  isValidLayer,
  type LayerObject
} from './layer'

describe('Bounds', () => {
  it('should create bounds with correct values', () => {
    const bounds = createBounds(10, 20, 100, 50)
    expect(bounds.x).toBe(10)
    expect(bounds.y).toBe(20)
    expect(bounds.width).toBe(100)
    expect(bounds.height).toBe(50)
  })
})

describe('DocumentMetadata', () => {
  it('should create default metadata with timestamps', () => {
    const metadata = createDefaultMetadata()
    expect(metadata.title).toBe('')
    expect(metadata.author).toBe('')
    expect(metadata.created).toBeTruthy()
    expect(metadata.modified).toBeTruthy()
  })
})

describe('ProjectSettings', () => {
  it('should create default settings', () => {
    const settings = createDefaultSettings()
    expect(settings.defaultFont).toBe('Arial')
    expect(settings.defaultFontSize).toBe(12)
    expect(settings.exportQuality).toBe('standard')
  })
})

describe('BookProjectData', () => {
  it('should create empty project with US Letter dimensions', () => {
    const project = createEmptyProject()
    expect(project.format).toBe('bookproj')
    expect(project.version).toBe('1.0.0')
    expect(project.document.pageWidth).toBe(612)
    expect(project.document.pageHeight).toBe(792)
    expect(project.document.pages).toHaveLength(0)
  })
})

describe('isValidLayer', () => {
  const validTextLayer: LayerObject = {
    id: 'text-0-1',
    type: 'text',
    bounds: { x: 0, y: 0, width: 100, height: 50 },
    visible: true,
    locked: false,
    zIndex: 1,
    opacity: 1,
    sourceType: 'extracted',
    role: 'content'
  }

  it('should validate a correct layer object', () => {
    expect(isValidLayer(validTextLayer)).toBe(true)
  })

  it('should reject null', () => {
    expect(isValidLayer(null)).toBe(false)
  })

  it('should reject undefined', () => {
    expect(isValidLayer(undefined)).toBe(false)
  })

  it('should reject non-object', () => {
    expect(isValidLayer('string')).toBe(false)
    expect(isValidLayer(123)).toBe(false)
  })

  it('should reject layer with missing id', () => {
    const { id, ...layerWithoutId } = validTextLayer
    expect(isValidLayer(layerWithoutId)).toBe(false)
  })

  it('should reject layer with invalid type', () => {
    expect(isValidLayer({ ...validTextLayer, type: 'invalid' })).toBe(false)
  })

  it('should reject layer with invalid sourceType', () => {
    expect(isValidLayer({ ...validTextLayer, sourceType: 'invalid' })).toBe(false)
  })

  it('should reject layer with invalid role', () => {
    expect(isValidLayer({ ...validTextLayer, role: 'invalid' })).toBe(false)
  })
})

// Property-based tests
describe('Layer Serialization (Property Tests)', () => {
  // Arbitrary for generating valid bounds
  const boundsArb = fc.record({
    x: fc.float({ min: 0, max: 1000, noNaN: true }),
    y: fc.float({ min: 0, max: 1000, noNaN: true }),
    width: fc.float({ min: 1, max: 1000, noNaN: true }),
    height: fc.float({ min: 1, max: 1000, noNaN: true })
  })

  // Arbitrary for generating valid layer types
  const layerTypeArb = fc.constantFrom('text', 'image', 'vector', 'shape') as fc.Arbitrary<
    'text' | 'image' | 'vector' | 'shape'
  >

  // Arbitrary for generating valid source types
  const sourceTypeArb = fc.constantFrom('extracted', 'manual', 'imported') as fc.Arbitrary<
    'extracted' | 'manual' | 'imported'
  >

  // Arbitrary for generating valid roles
  const roleArb = fc.constantFrom(
    'background',
    'content',
    'header',
    'footer',
    'annotation'
  ) as fc.Arbitrary<'background' | 'content' | 'header' | 'footer' | 'annotation'>

  // Arbitrary for generating valid layer objects
  const layerArb = fc.record({
    id: fc.string({ minLength: 1, maxLength: 50 }),
    type: layerTypeArb,
    bounds: boundsArb,
    visible: fc.boolean(),
    locked: fc.boolean(),
    zIndex: fc.integer({ min: -1000, max: 1000 }),
    opacity: fc.float({ min: 0, max: 1, noNaN: true }),
    sourceType: sourceTypeArb,
    role: roleArb
  })

  /**
   * Property 3: Layer Serialization Round-Trip
   * For any valid LayerObject, serializing to JSON then deserializing
   * SHALL produce an object equivalent to the original.
   *
   * Feature: book-creation-converter, Property 3: Layer Serialization Round-Trip
   * Validates: Requirements 3.9, 3.10, 3.11
   */
  it('Property 3: Layer serialization round-trip preserves all fields', () => {
    fc.assert(
      fc.property(layerArb, (layer) => {
        const json = JSON.stringify(layer)
        const deserialized = JSON.parse(json)

        expect(deserialized.id).toBe(layer.id)
        expect(deserialized.type).toBe(layer.type)
        expect(deserialized.bounds.x).toBeCloseTo(layer.bounds.x, 5)
        expect(deserialized.bounds.y).toBeCloseTo(layer.bounds.y, 5)
        expect(deserialized.bounds.width).toBeCloseTo(layer.bounds.width, 5)
        expect(deserialized.bounds.height).toBeCloseTo(layer.bounds.height, 5)
        expect(deserialized.visible).toBe(layer.visible)
        expect(deserialized.locked).toBe(layer.locked)
        expect(deserialized.zIndex).toBe(layer.zIndex)
        expect(deserialized.opacity).toBeCloseTo(layer.opacity, 5)
        expect(deserialized.sourceType).toBe(layer.sourceType)
        expect(deserialized.role).toBe(layer.role)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property 2: Layer Model Validity
   * For any LayerObject, the object SHALL contain all required base fields.
   *
   * Feature: book-creation-converter, Property 2: Layer Model Validity
   * Validates: Requirements 3.1-3.8
   */
  it('Property 2: Generated layers are valid', () => {
    fc.assert(
      fc.property(layerArb, (layer) => {
        expect(isValidLayer(layer)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})
