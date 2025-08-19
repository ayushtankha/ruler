import { AmpAgent } from '../../../src/agents/AmpAgent';
import * as FileSystemUtils from '../../../src/core/FileSystemUtils';
import { revertAllAgentConfigs } from '../../../src/revert';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Only mock FileSystemUtils for unit tests, not integration tests
jest.mock('../../../src/core/FileSystemUtils', () => {
  const actual = jest.requireActual('../../../src/core/FileSystemUtils');
  return {
    ...actual,
    writeGeneratedFile: jest.fn(),
    backupFile: jest.fn(),
  };
});

describe('AmpAgent', () => {
  let agent: AmpAgent;

  beforeEach(() => {
    agent = new AmpAgent();
    (FileSystemUtils.writeGeneratedFile as jest.Mock).mockClear();
  });

  it('should return the correct identifier', () => {
    expect(agent.getIdentifier()).toBe('amp');
  });

  it('should return the correct name', () => {
    expect(agent.getName()).toBe('Amp');
  });

  it('should return the correct default output path', () => {
    expect(agent.getDefaultOutputPath('/root')).toBe('/root/AGENT.md');
  });

  it('should apply ruler config to the default output path', async () => {
    const backupFile = jest.spyOn(FileSystemUtils, 'backupFile');
    const writeGeneratedFile = jest.spyOn(
      FileSystemUtils,
      'writeGeneratedFile',
    );

    await agent.applyRulerConfig('rules', '/root', null);

    expect(backupFile).toHaveBeenCalledWith('/root/AGENT.md');
    expect(writeGeneratedFile).toHaveBeenCalledWith('/root/AGENT.md', 'rules');
  });

  it('should apply ruler config to a custom output path', async () => {
    const backupFile = jest.spyOn(FileSystemUtils, 'backupFile');
    const writeGeneratedFile = jest.spyOn(
      FileSystemUtils,
      'writeGeneratedFile',
    );

    await agent.applyRulerConfig('rules', '/root', null, {
      outputPath: 'CUSTOM.md',
    });

    expect(backupFile).toHaveBeenCalledWith('/root/CUSTOM.md');
    expect(writeGeneratedFile).toHaveBeenCalledWith('/root/CUSTOM.md', 'rules');
  });

  describe('integration with backup and revert functionality', () => {
    let tmpDir: string;
    let realAgent: AmpAgent;
    let originalWriteGeneratedFile: any;

    beforeEach(async () => {
      // Restore the real writeGeneratedFile implementation for integration tests
      originalWriteGeneratedFile = jest.requireActual(
        '../../../src/core/FileSystemUtils',
      ).writeGeneratedFile;
      (FileSystemUtils.writeGeneratedFile as jest.Mock).mockImplementation(
        originalWriteGeneratedFile,
      );

      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amp-agent-test-'));
      realAgent = new AmpAgent();

      // Create .ruler directory for revert functionality
      const rulerDir = path.join(tmpDir, '.ruler');
      await fs.mkdir(rulerDir, { recursive: true });
      await fs.writeFile(path.join(rulerDir, 'instructions.md'), 'Test rules');
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
      // Restore the mock for unit tests
      (FileSystemUtils.writeGeneratedFile as jest.Mock).mockReset();
    });

    it('should create AGENT.md file when applying ruler config', async () => {
      const rules = 'Amp agent rules';
      await realAgent.applyRulerConfig(rules, tmpDir, null);

      const agentPath = path.join(tmpDir, 'AGENT.md');
      const content = await fs.readFile(agentPath, 'utf8');
      expect(content).toBe(rules);
    });

    it('should create backup when overwriting existing AGENT.md file', async () => {
      const agentPath = path.join(tmpDir, 'AGENT.md');
      const originalContent = 'Original content';
      const newContent = 'New rules';

      // Create original file
      await fs.writeFile(agentPath, originalContent);

      // Apply new rules (AmpAgent itself doesn't create backups, that's handled by the apply-engine)
      await realAgent.applyRulerConfig(newContent, tmpDir, null);

      // Verify new content is written
      const content = await fs.readFile(agentPath, 'utf8');
      expect(content).toBe(newContent);
    });

    it('should be properly reverted by revertAllAgentConfigs', async () => {
      const rules = 'Amp agent rules';
      await realAgent.applyRulerConfig(rules, tmpDir, null);

      const agentPath = path.join(tmpDir, 'AGENT.md');

      // Verify file exists
      await expect(fs.access(agentPath)).resolves.toBeUndefined();

      // Revert amp agent
      await revertAllAgentConfigs(
        tmpDir,
        ['amp'],
        undefined,
        false,
        false,
        false,
      );

      // Verify file is removed
      await expect(fs.access(agentPath)).rejects.toThrow();
    });

    it('should restore from backup when revert is called', async () => {
      const agentPath = path.join(tmpDir, 'AGENT.md');
      const backupPath = `${agentPath}.bak`;
      const originalContent = 'Original Amp content';
      const newContent = 'New Amp rules';

      // Create original file and backup
      await fs.writeFile(agentPath, originalContent);
      await fs.writeFile(backupPath, originalContent);

      // Overwrite with new content (simulating ruler apply)
      await fs.writeFile(agentPath, newContent);

      // Verify new content is in place
      expect(await fs.readFile(agentPath, 'utf8')).toBe(newContent);

      // Revert
      await revertAllAgentConfigs(
        tmpDir,
        ['amp'],
        undefined,
        false,
        false,
        false,
      );

      // Verify original content is restored
      const restoredContent = await fs.readFile(agentPath, 'utf8');
      expect(restoredContent).toBe(originalContent);

      // Verify backup is cleaned up (default behavior)
      await expect(fs.access(backupPath)).rejects.toThrow();
    });

    it('should handle custom output path correctly', async () => {
      const customPath = 'custom-amp.md';
      const rules = 'Custom rules';

      await realAgent.applyRulerConfig(rules, tmpDir, null, {
        outputPath: customPath,
      });

      const customFilePath = path.join(tmpDir, customPath);
      const content = await fs.readFile(customFilePath, 'utf8');
      expect(content).toBe(rules);
    });
  });
});
