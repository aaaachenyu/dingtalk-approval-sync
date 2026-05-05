import fs from 'node:fs/promises';
import path from 'node:path';

const defaultState = {
  seenApprovalIds: [],
  lastPollAt: null,
};

export class StateStore {
  constructor(filePath = path.resolve('data/state.json')) {
    this.filePath = filePath;
    this.state = { ...defaultState };
    this.loaded = false;
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      this.state = { ...defaultState, ...JSON.parse(raw) };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.state = { ...defaultState };
    }
    this.loaded = true;
  }

  async save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const compactState = {
      ...this.state,
      seenApprovalIds: [...new Set(this.state.seenApprovalIds)].slice(-10000),
    };
    await fs.writeFile(this.filePath, `${JSON.stringify(compactState, null, 2)}\n`, 'utf8');
    this.state = compactState;
  }

  async ensureLoaded() {
    if (!this.loaded) await this.load();
  }

  async hasApprovalId(id) {
    await this.ensureLoaded();
    return this.state.seenApprovalIds.includes(id);
  }

  async markApprovalId(id) {
    await this.ensureLoaded();
    if (!this.state.seenApprovalIds.includes(id)) {
      this.state.seenApprovalIds.push(id);
      await this.save();
    }
  }

  async markPollComplete(date = new Date()) {
    await this.ensureLoaded();
    this.state.lastPollAt = date.toISOString();
    await this.save();
  }
}
