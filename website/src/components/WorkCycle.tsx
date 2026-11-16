import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import type {ReactNode} from 'react';

/** One beat of the sample session, shown with the others. */
export type SessionBeatView = {
  id: string;
  step: string;
  claim: ReactNode;
  notes?: readonly {label: string; value: string}[];
};

/**
 * Five beats of the sample session, all visible at once.
 */
export function WorkCycle({
  beats,
  look,
}: {
  beats: readonly SessionBeatView[];
  look: ReactNode;
}) {
  return (
    <VStack gap={0} width="100%">
      {beats.map((beat, beatIndex) => (
        <VStack
          key={beat.id}
          className="beat beat-active"
          gap={3}
          hAlign="start"
          width="100%"
        >
          <HStack gap={4} vAlign="baseline">
            <Text className="beat-index">0{beatIndex + 1}</Text>
            <Text>{beat.step}</Text>
          </HStack>
          <Text className="beat-claim">{beat.claim}</Text>
          {beat.notes ? (
            <VStack className="pulse-parts" gap={0} width="100%">
              {beat.notes.map((note) => (
                <HStack
                  key={note.label}
                  className="pulse-part"
                  gap={4}
                  vAlign="baseline"
                  width="100%"
                >
                  <Text className="pulse-part-label">{note.label}</Text>
                  <Text className="pulse-part-text">{note.value}</Text>
                </HStack>
              ))}
            </VStack>
          ) : null}
          {beat.id === 'look' ? look : null}
        </VStack>
      ))}
    </VStack>
  );
}
