import { IItemRendererProps } from '@blueprintjs/select';
import { shell } from 'electron';
import { shallow } from 'enzyme';
import * as React from 'react';

import {
  AppearanceSettings,
  filterItem,
  renderItem
} from '../../../src/renderer/components/settings-general-appearance';

jest.mock('fs-extra');
jest.mock('../../../src/utils/import', () => ({
  fancyImport: async (p: string) => require(p)
}));

jest.mock('../../../src/renderer/themes', () => ({
  THEMES_PATH: '~/.electron-fiddle/themes',
  getAvailableThemes: () => Promise.resolve([{
    name: 'defaultDark',
    file: 'defaultDark'
  }]),
  getTheme: () => Promise.resolve({
    common: {}
  })
}));

describe('AppearanceSettings component', () => {
  let store: any;

  beforeEach(() => {
    store = {
      setTheme: jest.fn()
    };
  });

  it('renders', () => {
    const wrapper = shallow(
      <AppearanceSettings appState={store} />
    );

    expect(wrapper).toMatchSnapshot();
  });

  it('handles a theme change', () => {
    const wrapper = shallow(
      <AppearanceSettings appState={store} />
    );
    const instance: AppearanceSettings = wrapper.instance() as any;
    instance.handleChange({ file: 'defaultLight' } as any);

    expect(store.setTheme).toHaveBeenCalledWith('defaultLight');
  });

  describe('openThemeFolder()', () => {
    it('attempts to open the folder', async () => {
      const wrapper = shallow(
        <AppearanceSettings appState={store} />
      );
      const instance: AppearanceSettings = wrapper.instance() as any;
      await instance.openThemeFolder();

      expect(shell.showItemInFolder).toHaveBeenCalled();
    });

    it('handles an error', async () => {
      const wrapper = shallow(
        <AppearanceSettings appState={store} />
      );
      const instance: AppearanceSettings = wrapper.instance() as any;
      (shell as any).showItemInFolder.mockImplementationOnce(() => {
        throw new Error('Bwap');
      });

      expect(await instance.openThemeFolder()).toBe(false);
    });
  });

  describe('createNewThemeFromCurrent()', () => {
    it('creates a new file from the current theme', async () => {
      const fs = require('fs-extra');
      const wrapper = shallow(
        <AppearanceSettings appState={store} />
      );
      const instance: AppearanceSettings = wrapper.instance() as any;
      await instance.createNewThemeFromCurrent();

      expect(shell.showItemInFolder).toHaveBeenCalled();
      expect(fs.outputJSON).toHaveBeenCalled();

      const args = fs.outputJSON.mock.calls[0];
      expect(args[0].includes(`.electron-fiddle`)).toBe(true);
      expect(args[1].name).toBeDefined();
      expect(args[1].name === 'defaultDark').toBe(false);
      expect(args[1].common).toBeDefined();
      expect(args[1].file).toBeUndefined();
    });

    it('handles an error', async () => {
      const wrapper = shallow(
        <AppearanceSettings appState={store} />
      );
      const instance: AppearanceSettings = wrapper.instance() as any;
      (shell as any).showItemInFolder.mockImplementationOnce(() => {
        throw new Error('Bwap');
      });

      const result = await instance.createNewThemeFromCurrent();
      expect(result).toBe(false);
    });
  });

  describe('filterItem()', () => {
    it('filters', () => {
      const foo = filterItem('foo', { name: 'foo' } as any);
      expect(foo).toBe(true);

      const bar = filterItem('foo', { name: 'bar' } as any);
      expect(bar).toBe(false);
    });
  });

  describe('renderItem()', () => {
    const mockItemProps: IItemRendererProps = {
      handleClick: () => ({}),
      index: 0,
      modifiers: {
        active: false,
        disabled: false,
        matchesPredicate: true
      },
      query: ''
    };

    it('returns null for non-matching', () => {
      const result = renderItem({ name: 'foo' } as any, {
        ...mockItemProps,
        modifiers: {
          ...mockItemProps.modifiers,
          matchesPredicate: false
        }
      });

      expect(result).toBe(null);
    });

    it('returns a MenuItem for matching', () => {
      const result = renderItem({ name: 'foo' } as any, {
        ...mockItemProps
      });

      expect(result).toMatchSnapshot();
    });
  });
});
