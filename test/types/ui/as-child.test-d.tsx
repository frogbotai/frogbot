import {
  Checkbox,
  RadioGroup,
  RadioGroupItem,
  ScrollArea,
  ScrollBar,
  SelectContent,
  SelectItem,
  Switch,
} from '@frogbotai/ui';

export const content = (
  // @ts-expect-error SelectContent does not support asChild.
  <SelectContent asChild>
    <div />
  </SelectContent>
);

export const item = (
  // @ts-expect-error SelectItem does not support asChild.
  <SelectItem asChild value="one">
    <div />
  </SelectItem>
);

export const scrollArea = (
  // @ts-expect-error ScrollArea does not support asChild.
  <ScrollArea asChild>
    <div />
  </ScrollArea>
);

export const scrollBar = (
  <ScrollArea>
    {/* @ts-expect-error ScrollBar does not support asChild. */}
    <ScrollBar asChild orientation="horizontal" />
  </ScrollArea>
);

// @ts-expect-error Checkbox does not support asChild.
export const checkbox = <Checkbox asChild aria-label="Accept" />;

export const radio = (
  <RadioGroup>
    {/* @ts-expect-error RadioGroupItem does not support asChild. */}
    <RadioGroupItem asChild value="one" />
  </RadioGroup>
);

// @ts-expect-error Switch does not support asChild.
export const toggle = <Switch asChild aria-label="Enabled" />;

export const plain = (
  <ScrollArea className="list">
    <SelectContent position="item-aligned">
      <SelectItem value="one">One</SelectItem>
    </SelectContent>
    <ScrollBar orientation="horizontal" />
    <Checkbox aria-label="Accept" variant="secondary" />
    <RadioGroup>
      <RadioGroupItem value="one" />
    </RadioGroup>
    <Switch aria-label="Enabled" size="sm" />
  </ScrollArea>
);
