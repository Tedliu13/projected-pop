$ErrorActionPreference = "Stop"

$shpPath = Join-Path $PSScriptRoot "shapefile\TOWN_MOI_1140318.shp"
$dbfPath = Join-Path $PSScriptRoot "shapefile\TOWN_MOI_1140318.dbf"
$townsOutPath = Join-Path $PSScriptRoot "data\towns.geojson"
$countiesOutPath = Join-Path $PSScriptRoot "data\counties.geojson"
$maxRingPoints = 40

function Read-DbfRecords {
  param([string]$Path)

  $records = @()
  $encoding = [System.Text.Encoding]::UTF8
  $fs = [System.IO.File]::OpenRead($Path)
  $br = New-Object System.IO.BinaryReader($fs)

  try {
    $fs.Seek(4, [System.IO.SeekOrigin]::Begin) | Out-Null
    $recordCount = $br.ReadInt32()
    $headerLength = $br.ReadInt16()
    $recordLength = $br.ReadInt16()
    $fs.Seek(32, [System.IO.SeekOrigin]::Begin) | Out-Null

    $fields = New-Object System.Collections.Generic.List[object]
    while ($fs.Position -lt ($headerLength - 1)) {
      $nameBytes = $br.ReadBytes(11)
      if ($nameBytes.Length -lt 11 -or $nameBytes[0] -eq 0x0D) {
        break
      }

      $name = ([System.Text.Encoding]::ASCII.GetString($nameBytes)).Trim([char]0).Trim()
      $type = [char]$br.ReadByte()
      $fs.Seek(4, [System.IO.SeekOrigin]::Current) | Out-Null
      $length = $br.ReadByte()
      $decimal = $br.ReadByte()
      $fs.Seek(14, [System.IO.SeekOrigin]::Current) | Out-Null

      $fields.Add([ordered]@{
        Name = $name
        Type = $type
        Length = $length
        Decimal = $decimal
      })
    }

    $fs.Seek($headerLength, [System.IO.SeekOrigin]::Begin) | Out-Null
    for ($recordIndex = 0; $recordIndex -lt $recordCount; $recordIndex++) {
      $deletedFlag = $br.ReadByte()
      if ($deletedFlag -eq 0x2A) {
        $fs.Seek($recordLength - 1, [System.IO.SeekOrigin]::Current) | Out-Null
        continue
      }

      $record = [ordered]@{}
      foreach ($field in $fields) {
        $raw = $br.ReadBytes($field.Length)
        $record[$field.Name] = $encoding.GetString($raw).Trim()
      }
      $records += [pscustomobject]$record
    }
  }
  finally {
    $br.Close()
    $fs.Close()
  }

  return $records
}

function Read-ShapefilePolygons {
  param([string]$Path)

  $records = @()
  $fs = [System.IO.File]::OpenRead($Path)
  $br = New-Object System.IO.BinaryReader($fs)

  try {
    $fs.Seek(100, [System.IO.SeekOrigin]::Begin) | Out-Null

    while ($fs.Position -lt $fs.Length) {
      if (($fs.Length - $fs.Position) -lt 8) {
        break
      }

      $recordNumber = Read-Int32BigEndian $br
      $contentLengthWords = Read-Int32BigEndian $br
      $contentLengthBytes = $contentLengthWords * 2
      $recordStart = $fs.Position

      if ($contentLengthBytes -le 0) {
        break
      }

      $shapeType = $br.ReadInt32()
      if ($shapeType -eq 0) {
        $records += $null
        $fs.Seek($recordStart + $contentLengthBytes, [System.IO.SeekOrigin]::Begin) | Out-Null
        continue
      }

      if ($shapeType -ne 5) {
        throw "Unsupported shape type $shapeType in record $recordNumber."
      }

      $null = $br.ReadDouble()
      $null = $br.ReadDouble()
      $null = $br.ReadDouble()
      $null = $br.ReadDouble()
      $numParts = $br.ReadInt32()
      $numPoints = $br.ReadInt32()

      $parts = @()
      for ($partIndex = 0; $partIndex -lt $numParts; $partIndex++) {
        $parts += $br.ReadInt32()
      }

      $points = @()
      for ($pointIndex = 0; $pointIndex -lt $numPoints; $pointIndex++) {
        $x = [Math]::Round($br.ReadDouble(), 4)
        $y = [Math]::Round($br.ReadDouble(), 4)
        $points += ,@($x, $y)
      }

      $coordinates = @()
      for ($partIndex = 0; $partIndex -lt $numParts; $partIndex++) {
        $start = $parts[$partIndex]
        $end = if ($partIndex -lt ($numParts - 1)) { $parts[$partIndex + 1] } else { $numPoints }
        $ring = @()

        for ($pointIndex = $start; $pointIndex -lt $end; $pointIndex++) {
          $ring += ,@($points[$pointIndex][0], $points[$pointIndex][1])
        }

        if ($ring.Count -gt 0) {
          $first = $ring[0]
          $last = $ring[$ring.Count - 1]
          if ($first[0] -ne $last[0] -or $first[1] -ne $last[1]) {
            $ring += ,@($first[0], $first[1])
          }
          $ring = Simplify-Ring -Ring $ring -MaxPoints $maxRingPoints
          $coordinates += ,(,$ring)
        }
      }

      $records += [ordered]@{
        type = "MultiPolygon"
        coordinates = @($coordinates)
      }

      $fs.Seek($recordStart + $contentLengthBytes, [System.IO.SeekOrigin]::Begin) | Out-Null
    }
  }
  finally {
    $br.Close()
    $fs.Close()
  }

  return $records
}

function Read-Int32BigEndian {
  param([System.IO.BinaryReader]$Reader)

  $bytes = $Reader.ReadBytes(4)
  [Array]::Reverse($bytes)
  return [System.BitConverter]::ToInt32($bytes, 0)
}

function Simplify-Ring {
  param(
    [object[]]$Ring,
    [int]$MaxPoints
  )

  if (-not $Ring -or $Ring.Count -le ($MaxPoints + 1)) {
    return $Ring
  }

  $limit = [Math]::Max(8, $MaxPoints)
  $stride = [Math]::Ceiling(($Ring.Count - 1) / $limit)
  $simplified = @()

  for ($i = 0; $i -lt ($Ring.Count - 1); $i += $stride) {
    $simplified += ,@($Ring[$i][0], $Ring[$i][1])
  }

  $last = $Ring[$Ring.Count - 1]
  $end = $simplified[$simplified.Count - 1]
  if ($end[0] -ne $last[0] -or $end[1] -ne $last[1]) {
    $simplified += ,@($last[0], $last[1])
  }

  if ($simplified.Count -lt 4) {
    return $Ring
  }

  return $simplified
}

$attributes = Read-DbfRecords -Path $dbfPath
$geometries = Read-ShapefilePolygons -Path $shpPath

if ($attributes.Count -ne $geometries.Count) {
  throw "DBF records ($($attributes.Count)) and SHP records ($($geometries.Count)) do not match."
}

$townFeatures = @()
$countyGroups = @{}

for ($i = 0; $i -lt $attributes.Count; $i++) {
  $attr = $attributes[$i]
  $geometry = $geometries[$i]

  if (-not $geometry) {
    continue
  }

  $props = [ordered]@{
    code = $attr.TOWNCODE
    county = $attr.COUNTYNAME
    town = $attr.TOWNNAME
    towneng = $attr.TOWNENG
    countyCode = $attr.COUNTYCODE
  }

  $feature = [ordered]@{
    type = "Feature"
    properties = $props
    geometry = $geometry
  }
  $townFeatures += $feature

  if (-not $countyGroups.ContainsKey($attr.COUNTYNAME)) {
    $countyGroups[$attr.COUNTYNAME] = [ordered]@{
      county = $attr.COUNTYNAME
      countyCode = $attr.COUNTYCODE
      polygons = @()
    }
  }

  foreach ($polygon in $geometry.coordinates) {
    $countyGroups[$attr.COUNTYNAME].polygons += ,(,$polygon)
  }
}

$countyFeatures = @()
foreach ($countyName in ($countyGroups.Keys | Sort-Object)) {
  $group = $countyGroups[$countyName]
  $countyFeatures += [ordered]@{
    type = "Feature"
    properties = [ordered]@{
      county = $group.county
      countyCode = $group.countyCode
    }
    geometry = [ordered]@{
      type = "MultiPolygon"
      coordinates = @($group.polygons)
    }
  }
}

$townCollection = [ordered]@{
  type = "FeatureCollection"
  features = @($townFeatures)
}

$countyCollection = [ordered]@{
  type = "FeatureCollection"
  features = @($countyFeatures)
}

$townCollection | ConvertTo-Json -Depth 100 -Compress | Set-Content -Path $townsOutPath -Encoding UTF8
$countyCollection | ConvertTo-Json -Depth 100 -Compress | Set-Content -Path $countiesOutPath -Encoding UTF8

Write-Output "Wrote $townsOutPath"
Write-Output "Wrote $countiesOutPath"
