(function (global) {
  'use strict';
  global.CaissaInteractiveDiagramsManifest = Object.freeze({
  "schema": "CaissaInteractiveDiagramManifest@1.0.0",
  "collectionId": "caissa-knowledge-diagram-pilot",
  "releaseId": "rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84",
  "releaseHash": "da0b332b45933135eede26894ab8d23ece9f674299071bc8847e2da6a2811f37",
  "maxDiagrams": 4,
  "diagrams": [
    {
      "order": 1,
      "diagramId": "icd-pilot-1",
      "sourceUnitId": "ku:endgames:pawn-foundations:direct-opposition",
      "sourcePositionId": "pos:direct-opposition:file",
      "releaseId": "rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84",
      "releaseHash": "da0b332b45933135eede26894ab8d23ece9f674299071bc8847e2da6a2811f37",
      "title": "Recognize direct opposition",
      "legend": "White to move. Compare the kings on the e-file before choosing a route.",
      "purpose": "Recognize direct king opposition and the importance of the move.",
      "fen": "8/8/4k3/8/4K3/8/P7/8 w - - 0 1",
      "sideToMove": "white",
      "arrows": [
        "e4d4"
      ],
      "squares": [
        "e4",
        "e6"
      ],
      "moveSequence": [],
      "provenance": {
        "sourceType": "immutable-public-knowledge-release",
        "contentHash": "3562ff5b5f3f465ce3f78621903ba1bbf123fe0f4d54f3de8d562d87c60e9dd0"
      },
      "buttons": false,
      "playMode": false
    },
    {
      "order": 2,
      "diagramId": "icd-pilot-2",
      "sourceUnitId": "ku:endgames:pawn-foundations:rule-of-the-square",
      "sourcePositionId": "pos:rule-square:a-pawn-white-king-outside",
      "releaseId": "rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84",
      "releaseHash": "da0b332b45933135eede26894ab8d23ece9f674299071bc8847e2da6a2811f37",
      "title": "Test the pawn’s square",
      "legend": "White to move. Estimate whether the king can enter the pawn’s catching square.",
      "purpose": "Use board geometry to estimate a king-and-pawn race.",
      "fen": "k7/8/8/8/p7/8/8/7K w - - 0 1",
      "sideToMove": "white",
      "arrows": [
        "h1g2"
      ],
      "squares": [
        "a4",
        "d4",
        "d1"
      ],
      "moveSequence": [],
      "provenance": {
        "sourceType": "immutable-public-knowledge-release",
        "contentHash": "578c18c96855d5b14dfd08b857a811e5c101c9cb02f580d26f8f553b20c19b47"
      },
      "buttons": false,
      "playMode": false
    },
    {
      "order": 3,
      "diagramId": "icd-pilot-3",
      "sourceUnitId": "ku:endgames:pawn-foundations:key-squares",
      "sourcePositionId": "pos:key-squares:central-pawn-route",
      "releaseId": "rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84",
      "releaseHash": "da0b332b45933135eede26894ab8d23ece9f674299071bc8847e2da6a2811f37",
      "title": "Approach the key squares",
      "legend": "White to move. Identify a useful supporting square before advancing the pawn.",
      "purpose": "Turn king activity into a concrete supporting-square plan.",
      "fen": "8/3k4/8/8/3P4/3K4/8/8 w - - 0 1",
      "sideToMove": "white",
      "arrows": [
        "d3c3"
      ],
      "squares": [
        "c3",
        "d3",
        "e3"
      ],
      "moveSequence": [],
      "provenance": {
        "sourceType": "immutable-public-knowledge-release",
        "contentHash": "9eddd47cce436092326be330747a2a2b30823c9ab6bac9717bab667aa9dcd657"
      },
      "buttons": false,
      "playMode": false
    },
    {
      "order": 4,
      "diagramId": "icd-pilot-4",
      "sourceUnitId": "ku:endgames:pawn-transformations:pawn-breakthrough",
      "sourcePositionId": "pos:pawn-breakthrough:three-versus-three",
      "releaseId": "rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84",
      "releaseHash": "da0b332b45933135eede26894ab8d23ece9f674299071bc8847e2da6a2811f37",
      "title": "See the pawn breakthrough",
      "legend": "White to move. Trace the forcing sequence that creates a surviving passed pawn.",
      "purpose": "Study a forcing pawn transformation and its surviving passer.",
      "fen": "8/ppp5/8/PPP5/8/8/8/4K2k w - - 0 1",
      "sideToMove": "white",
      "arrows": [
        "b5b6",
        "c5c6",
        "a5a6"
      ],
      "squares": [
        "a7",
        "b7",
        "c7"
      ],
      "moveSequence": [
        "b6",
        "axb6",
        "c6",
        "bxc6",
        "a6"
      ],
      "provenance": {
        "sourceType": "immutable-public-knowledge-release",
        "contentHash": "736e0347c76837c4347d59fb7517f6ce2136e75e80405dfc1445e633425e179b"
      },
      "buttons": false,
      "playMode": false
    }
  ]
});
}(window));
