import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ModelSelector,
  type ModelSelectorModel,
} from '../../../../packages/ui/src/chat/model-selector';

const gpt: ModelSelectorModel = {
  id: 'openai/gpt-5',
  name: 'GPT-5',
  provider: 'OpenAI',
  reasoning: [
    { key: 'minimal', label: 'Minimal' },
    { key: 'low', label: 'Low' },
    { key: 'medium', label: 'Medium' },
    { key: 'high', label: 'High' },
  ],
};

const mini: ModelSelectorModel = {
  id: 'openai/gpt-5-mini',
  name: 'GPT-5 mini',
  provider: 'OpenAI',
  reasoning: [{ key: 'high', label: 'High' }],
};

const plain: ModelSelectorModel = { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' };

const opus: ModelSelectorModel = {
  id: 'anthropic/claude-opus',
  name: 'Claude Opus',
  provider: 'Anthropic',
  reasoning: [
    { key: 'high', label: 'High · 16k' },
    { key: 'max', label: 'Max · 32k' },
  ],
};

const models = [gpt, mini, plain, opus];

function Harness({
  choices = models,
  initialModel = gpt.id,
  initialReasoning,
  onModelChange,
  onReasoningChange,
}: {
  choices?: readonly ModelSelectorModel[];
  initialModel?: string;
  initialReasoning?: string;
  onModelChange?: (id: string) => void;
  onReasoningChange?: (key: string | undefined) => void;
}) {
  const [model, setModel] = useState(initialModel);
  const [reasoning, setReasoning] = useState(initialReasoning);

  return (
    <ModelSelector
      models={choices}
      selectedModelId={model}
      selectedReasoning={reasoning}
      onModelChange={(id) => {
        onModelChange?.(id);
        setModel(id);
        setReasoning(undefined);
      }}
      onReasoningChange={(key) => {
        onReasoningChange?.(key);
        setReasoning(key);
      }}
    />
  );
}

function trigger() {
  return screen.getByRole('button', { expanded: false });
}

function openTrigger() {
  return screen.getByRole('button', { expanded: true });
}

function stopLabels() {
  return [...document.querySelectorAll('.fb-slider__stop')].map((stop) => stop.textContent);
}

async function openList(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: `${name}, change model` }));
}

describe('ModelSelector', () => {
  it('renders nothing without models', () => {
    const { container, rerender } = render(
      <ModelSelector
        selectedModelId={gpt.id}
        onModelChange={() => undefined}
        onReasoningChange={() => undefined}
      />,
    );

    expect(container.innerHTML).toBe('');

    rerender(
      <ModelSelector
        models={[]}
        selectedModelId={gpt.id}
        onModelChange={() => undefined}
        onReasoningChange={() => undefined}
      />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('shows the model name and the selected level on the trigger', () => {
    render(<Harness initialReasoning="medium" />);

    expect(trigger().textContent).toBe('GPT-5 · Medium');
  });

  it('shows Default on the trigger when no level is selected', () => {
    render(<Harness />);

    expect(trigger().textContent).toBe('GPT-5 · Default');
  });

  it('shows only the name on the trigger for a model without reasoning levels', () => {
    render(<Harness initialModel={plain.id} />);

    expect(trigger().textContent).toBe('GPT-4o');
  });

  it('shows Default on the trigger for a level the model does not offer', () => {
    render(<Harness initialModel={opus.id} initialReasoning="minimal" />);

    expect(trigger().textContent).toBe('Claude Opus · Default');
  });

  it('styles the model name separately from the muted level', () => {
    render(<Harness initialReasoning="low" />);

    const [name, level] = trigger().querySelectorAll('span');

    expect(name.className).toBe('fb-model-selector__name');
    expect(name.textContent).toBe('GPT-5');
    expect(level.className).toBe('fb-model-selector__level');
    expect(level.textContent).toBe('· Low');
  });

  it('renders the trigger as a borderless text button', () => {
    render(<Harness />);

    expect(trigger().className).toBe('fb-model-selector__trigger');
    expect(trigger().getAttribute('type')).toBe('button');
  });

  it('opens on the reasoning controls instead of the model list', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());

    expect(screen.getByRole('slider', { name: 'Reasoning' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'GPT-5, change model' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Claude Opus' })).toBeNull();
  });

  it('focuses the model name button when the popover opens', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'GPT-5, change model' }),
    );
  });

  it('omits the slider for a model without reasoning levels', async () => {
    const user = userEvent.setup();

    render(<Harness initialModel={plain.id} />);

    await user.click(trigger());

    expect(screen.getByRole('button', { name: 'GPT-4o, change model' })).toBeTruthy();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('offers Default followed by the model levels as slider stops', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());

    expect(stopLabels()).toEqual(['Default', 'Minimal', 'Low', 'Medium', 'High']);
  });

  it('offers Default and the only level for a single-level model', async () => {
    const user = userEvent.setup();

    render(<Harness initialModel={mini.id} />);

    await user.click(trigger());

    expect(stopLabels()).toEqual(['Default', 'High']);
    expect(screen.getByRole('slider').getAttribute('max')).toBe('1');
  });

  it('offers labelled budget levels as slider stops', async () => {
    const user = userEvent.setup();

    render(<Harness initialModel={opus.id} />);

    await user.click(trigger());

    expect(stopLabels()).toEqual(['Default', 'High · 16k', 'Max · 32k']);
  });

  it('positions the slider on the selected level', async () => {
    const user = userEvent.setup();

    render(<Harness initialModel={opus.id} initialReasoning="max" />);

    await user.click(trigger());

    const slider = screen.getByRole('slider') as HTMLInputElement;

    expect(slider.value).toBe('2');
    expect(slider.getAttribute('aria-valuetext')).toBe('Max · 32k');
  });

  it('reports the level key when the slider moves to a level', async () => {
    const onReasoningChange = vi.fn();
    const user = userEvent.setup();

    render(<Harness initialModel={opus.id} onReasoningChange={onReasoningChange} />);

    await user.click(trigger());

    fireEvent.change(screen.getByRole('slider'), { target: { value: '1' } });

    expect(onReasoningChange).toHaveBeenLastCalledWith('high');
    expect(openTrigger().textContent).toBe('Claude Opus · High · 16k');
  });

  it('reports undefined when the slider moves to Default', async () => {
    const onReasoningChange = vi.fn();
    const user = userEvent.setup();

    render(<Harness initialReasoning="high" onReasoningChange={onReasoningChange} />);

    await user.click(trigger());

    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } });

    expect(onReasoningChange).toHaveBeenLastCalledWith(undefined);
    expect(openTrigger().textContent).toBe('GPT-5 · Default');
  });

  it('switches the popover to the model list from the model name', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');

    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Claude Opus' })).toBeTruthy();
  });

  it('groups the model list by provider when several providers are allowed', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');

    const openai = screen.getByRole('group', { name: 'OpenAI' });
    const anthropic = screen.getByRole('group', { name: 'Anthropic' });

    expect(openai.querySelectorAll('.fb-model-selector__option')).toHaveLength(3);
    expect(anthropic.querySelectorAll('.fb-model-selector__option')).toHaveLength(1);
  });

  it('lists models without provider groups when one provider is allowed', async () => {
    const user = userEvent.setup();

    render(<Harness choices={[gpt, mini, plain]} />);

    await user.click(trigger());
    await openList(user, 'GPT-5');

    expect(screen.queryByRole('group')).toBeNull();
    expect(document.querySelectorAll('.fb-model-selector__option')).toHaveLength(3);
  });

  it('marks and focuses the selected model in the list', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');

    const current = screen.getByRole('button', { name: 'GPT-5', current: true });

    expect(document.activeElement).toBe(current);
    expect(current.querySelector('.fb-model-selector__check')).toBeTruthy();
  });

  it('reports the chosen model and returns to the controls', async () => {
    const onModelChange = vi.fn();
    const user = userEvent.setup();

    render(<Harness onModelChange={onModelChange} />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.click(screen.getByRole('button', { name: 'Claude Opus' }));

    expect(onModelChange).toHaveBeenCalledWith(opus.id);
    expect(stopLabels()).toEqual(['Default', 'High · 16k', 'Max · 32k']);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Claude Opus, change model' }),
    );
  });

  it('does not report a change when the current model is chosen again', async () => {
    const onModelChange = vi.fn();
    const user = userEvent.setup();

    render(<Harness onModelChange={onModelChange} />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.click(screen.getByRole('button', { name: 'GPT-5', current: true }));

    expect(onModelChange).not.toHaveBeenCalled();
    expect(screen.getByRole('slider')).toBeTruthy();
  });

  it('returns from the list without changing the model or level', async () => {
    const onModelChange = vi.fn();
    const onReasoningChange = vi.fn();
    const user = userEvent.setup();

    render(
      <Harness
        initialReasoning="low"
        onModelChange={onModelChange}
        onReasoningChange={onReasoningChange}
      />,
    );

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(onModelChange).not.toHaveBeenCalled();
    expect(onReasoningChange).not.toHaveBeenCalled();
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('Low');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'GPT-5, change model' }),
    );
  });

  it('reopens on the controls after closing from the list', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await openList(user, 'GPT-5');
    await user.keyboard('{Escape}');
    await user.click(trigger());

    expect(screen.getByRole('slider')).toBeTruthy();
  });

  it('returns focus to the trigger when the popover closes', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(trigger());
    await user.keyboard('{Escape}');

    expect(document.activeElement).toBe(trigger());
  });
});
