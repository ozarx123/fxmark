/**
 * Unit tests: IB parent cycle + depth (no Mongo).
 * Run: npm run test:ib-hierarchy
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  wouldAssigningParentCreateCycle,
  newIbLevelExceedsMax,
  MAX_IB_LEVEL,
} from './ib-hierarchy.service.js';

describe('wouldAssigningParentCreateCycle', () => {
  it('returns false when upline never hits target IB', async () => {
    const parents = { root: null, mid: 'root', leaf: 'mid' };
    const getParent = async (id) => parents[id] ?? null;
    assert.equal(await wouldAssigningParentCreateCycle('other', 'leaf', getParent), false);
  });

  it('returns true when proposed parent is under target IB (target is ancestor of parent)', async () => {
    // ib=sub, chain: root <- mid <- sub <- leaf  →  leaf's upline includes sub
    const parents = { leaf: 'sub', sub: 'mid', mid: 'root', root: null };
    const getParent = async (id) => parents[id] ?? null;
    assert.equal(await wouldAssigningParentCreateCycle('sub', 'leaf', getParent), true);
  });

  it('returns false for direct child as parent when no cycle (parent is above ib)', async () => {
    const parents = { ib: 'boss', boss: null };
    const getParent = async (id) => parents[id] ?? null;
    assert.equal(await wouldAssigningParentCreateCycle('ib', 'boss', getParent), false);
  });

  it('stops on repeated upline (broken data) without true cycle', async () => {
    const getParent = async (id) => (id === 'a' ? 'b' : id === 'b' ? 'a' : null);
    assert.equal(await wouldAssigningParentCreateCycle('x', 'a', getParent), false);
  });
});

describe('newIbLevelExceedsMax', () => {
  it('allows level 5 when parent is depth 4', () => {
    assert.equal(newIbLevelExceedsMax(4, 5), false);
  });

  it('rejects when new level would be 6 with max 5', () => {
    assert.equal(newIbLevelExceedsMax(5, 5), true);
  });

  it('uses MAX_IB_LEVEL by default', () => {
    assert.equal(newIbLevelExceedsMax(MAX_IB_LEVEL - 1), false);
    assert.equal(newIbLevelExceedsMax(MAX_IB_LEVEL), true);
  });

  it('treats invalid depth as exceed (fail safe)', () => {
    assert.equal(newIbLevelExceedsMax(NaN, 5), true);
    assert.equal(newIbLevelExceedsMax(0, 5), true);
  });
});
