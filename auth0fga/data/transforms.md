
Convert Assets in Asset groups (storyboards) into fga parent relationships
```
$.getAssetType.Asset@$a.{
    "user": ("asset:" & %.identifier[0].identifierValue),
    "relation": "parent",
    "object": ("asset:" & $a.structuralCharacteristics.identifier[0].identifierValue)
}
```
Allow members of 'labkoat.media' to access the asset, and set the functional type (of parent)
```
$reduce($.getAssetType.[{
    "user": 'organization:labkoat.media#member',
    "relation": 'owner',
    "object": ("asset:" & identifier[0].identifierValue)
},{
    "user": ('function:' & functionalCharacteristics.functionalType & '#functionalType'),
    "relation": 'canEdit',
    "object": ('asset:' & identifier[0].identifierValue)
}], $append)
```


Convert a list of asset identifiers into a map with their filename
```
$merge($.getAssetType.{
    (identifier[0].identifierValue): $merge($.Asset.{
        ($.structuralCharacteristics.identifier[0].identifierValue): ($.structuralCharacteristics.structuralProperties.fileDetails.fileName)
    })
})
```

Takes OMC-Asset and pulls out select data for use in the presentation UI
```
$merge($.getAssetType.{
    (identifier[0].identifierValue): $merge($.Asset.{
        ($.structuralCharacteristics.identifier[0].identifierValue): {
            "name": name,
            "description": description,
            "filename": ($.structuralCharacteristics.structuralProperties.fileDetails.fileName),
            "identifier": $.structuralCharacteristics.identifier[0].identifierValue
        }
    })
})
```
