import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';

/** One line in a sample terminal. Labels align; commands show a prompt. */
export type TermRow =
  | {kind: 'cmd'; text: string}
  | {kind: 'text'; text: string}
  | {kind: 'pair'; label: string; value: string}
  | {kind: 'sub'; text: string}
  | {kind: 'blank'}
  | {kind: 'foot'; text: string};

/**
 * A terminal chrome around sample session lines.
 * The lines are text, so they stay sharp inside the page column.
 */
export function TerminalWindow({
  title,
  rows,
  caret = false,
}: {
  title: string;
  rows: TermRow[];
  /** Draw a prompt caret after the rows. */
  caret?: boolean;
}) {
  return (
    <VStack className="term" gap={0} width="100%">
      <HStack className="term-bar" gap={3} vAlign="center" width="100%">
        <HStack gap={2} vAlign="center">
          <Text className="term-dot term-dot-close" aria-hidden="true">
            {' '}
          </Text>
          <Text className="term-dot term-dot-min" aria-hidden="true">
            {' '}
          </Text>
          <Text className="term-dot term-dot-max" aria-hidden="true">
            {' '}
          </Text>
        </HStack>
        <Text className="term-title" type="supporting" color="secondary">
          {title}
        </Text>
      </HStack>
      <VStack className="term-body" gap={1} width="100%">
        {rows.map((row, index) => (
          <TermLine key={`${row.kind}-${index}`} row={row} />
        ))}
        {caret ? (
          <Text className="term-line term-cmd" display="block">
            ${' '}
            <Text className="term-caret" aria-hidden="true">
              {' '}
            </Text>
          </Text>
        ) : null}
      </VStack>
    </VStack>
  );
}

function TermLine({row}: {row: TermRow}) {
  if (row.kind === 'blank') {
    return (
      <Text className="term-line" display="block">
        {' '}
      </Text>
    );
  }
  if (row.kind === 'cmd') {
    return (
      <Text className="term-line term-cmd" display="block">
        $ {row.text}
      </Text>
    );
  }
  if (row.kind === 'pair') {
    return (
      <HStack className="term-pair" gap={4} vAlign="baseline" width="100%">
        <Text className="term-line term-label" color="secondary">
          {row.label}
        </Text>
        <Text className="term-line">{row.value}</Text>
      </HStack>
    );
  }
  if (row.kind === 'sub') {
    return (
      <Text className="term-line term-sub" display="block" color="secondary">
        {row.text}
      </Text>
    );
  }
  if (row.kind === 'foot') {
    return (
      <Text className="term-line term-foot" display="block" color="secondary">
        {row.text}
      </Text>
    );
  }
  return (
    <Text className="term-line" display="block">
      {row.text}
    </Text>
  );
}
