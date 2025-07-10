## About this dataset
Ah, yes. Finally a good, relevant question!!! The human race has managed to reach for the stars, however it still struggles to understand our feline friends.
With this dataset you can contribute to this relevant task and perhaps one day we'll be able to translate their meows - so that they can officially tell us that we are in fact their pets.

This dataset, composed of 440 sound recordings, contains meows emitted by cats in different contexts. Specifically, 21 cats belonging to 2 breeds (Maine Coon and European Shorthair) have been repeatedly exposed to three different stimuli that act as labels for prediction:

- Waiting for food;
- Isolation in unfamiliar environment;
- Brushing (being brushed affectionately by the owner).

## File naming

Suggest Edits
Data directory.
Naming convention for files -> ``C_NNNNN_BB_SS_OOOOO_RXX``, where:

- C = emission context (values: B = brushing; F = waiting for food; I: isolation in an unfamiliar environment);

- NNNNN = cat’s unique ID;
- BB = breed (values: MC = Maine Coon; EU: European Shorthair);
- SS = sex (values: FI = female, intact; FN: female, neutered; - - MI: male, intact; MN: male, neutered);
- OOOOO = cat owner’s unique ID;
- R = recording session (values: 1, 2 or 3)
- XX = vocalization counter (values: 01..99)

## Extra content
The "extra" folder contains excluded recordings (sounds other than meows emitted by cats) and uncut sequences of close vocalizations. It can be used as a 4th class.

## How to use this dataset
Create an audio classifier for Meow Classification
Explore the audio spectrograms and tabular variables