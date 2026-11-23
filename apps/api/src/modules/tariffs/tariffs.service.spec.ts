import { describe, expect, it } from '@jest/globals';

import { priceRange } from './tariffs.service';

describe('priceRange', () => {
  it('keeps one price, a range, and no price yet', () => {
    expect(priceRange({ price: 90, maxPrice: null })).toEqual({
      price: 90,
      maxPrice: null,
    });
    expect(priceRange({ price: 130, maxPrice: 150 })).toEqual({
      price: 130,
      maxPrice: 150,
    });
    expect(priceRange({ price: null, maxPrice: null })).toEqual({
      price: null,
      maxPrice: null,
    });
  });

  it('reads a range from a figure to itself as that one figure', () => {
    expect(priceRange({ price: 120, maxPrice: 120 })).toEqual({
      price: 120,
      maxPrice: null,
    });
  });

  it('refuses a top with nothing under it, or under its own bottom', () => {
    expect(priceRange({ price: null, maxPrice: 150 })).toBeNull();
    expect(priceRange({ price: 150, maxPrice: 130 })).toBeNull();
  });
});
