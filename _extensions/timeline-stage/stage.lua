-- timeline-stage: Quarto filter.
-- Reads timeline.yml, converts dates to decimal years, embeds it as JSON,
-- marks `.stage` slides, and turns `.pin` / `.cover` divs into overlays.

local DATE_KEYS = { start = true, ["end"] = true, year = true, at = true }

-- "1949-06-09" -> 1949.44 ; "1949-06" -> 1949.41 ; "1949" / 1949 -> 1949
local function to_decimal_year(v)
  if type(v) == "number" then return v end
  local s = tostring(v)
  local y, m, d = s:match("^(%d%d%d%d)%-(%d%d)%-(%d%d)$")
  if not y then y, m = s:match("^(%d%d%d%d)%-(%d%d)$"); d = m and "0" or nil end
  if not y then
    local n = tonumber(s)
    return n
  end
  local days = { 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334 }
  local doy = days[tonumber(m)] + tonumber(d)
  local dec = tonumber(y) + doy / 365.25
  return math.floor(dec * 100 + 0.5) / 100
end

local function meta_to_lua(v)
  local t = pandoc.utils.type(v)
  if t == "boolean" then return v end
  if t == "List" then
    local out = {}
    for i, x in ipairs(v) do out[i] = meta_to_lua(x) end
    return out
  end
  if t == "Meta" or t == "table" then
    local out = {}
    for k, x in pairs(v) do out[k] = meta_to_lua(x) end
    return out
  end
  -- Inlines / Blocks / string
  local s = pandoc.utils.stringify(v)
  local n = tonumber(s)
  if n ~= nil and s:match("^%-?%d+%.?%d*$") then return n end
  return s
end

local function convert_dates(node, key)
  if type(node) ~= "table" then
    if key and DATE_KEYS[key] then return to_decimal_year(node) end
    return node
  end
  local is_list = #node > 0
  for k, v in pairs(node) do
    if is_list and key == "span" then
      node[k] = to_decimal_year(v)
    elseif is_list and key == "meets" and type(v) == "table" and #v == 3 then
      v[3] = to_decimal_year(v[3])
    elseif (k == "a" or k == "b") and type(v) == "string" and v:find("@") then
      local id, yr = v:match("^(.-)@(.+)$")
      node[k] = id .. "@" .. tostring(to_decimal_year(yr))
    else
      node[k] = convert_dates(v, is_list and key or k)
    end
  end
  return node
end

local function read_timeline(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local text = f:read("a"); f:close()
  local doc = pandoc.read("---\n" .. text .. "\n---\n", "markdown")
  local data = meta_to_lua(doc.meta)
  return convert_dates(data, nil)
end

local embedded = false

local function Meta(meta)
  if embedded then return end
  local path = "timeline.yml"
  if meta.stage and meta.stage.timeline then path = pandoc.utils.stringify(meta.stage.timeline) end
  local data = read_timeline(path)
  if not data then
    quarto.log.error("timeline-stage: cannot read " .. path)
    os.exit(1)
  end
  local json = pandoc.json.encode(data)
  quarto.doc.include_text("after-body",
    '<script type="application/json" id="stage-data">' .. json .. "</script>")
  embedded = true
end

local function Header(h)
  if h.classes:includes("stage") then
    h.attributes["transition"] = "none"
  end
  return h
end

local function Div(d)
  if d.classes:includes("pin") or d.classes:includes("cover") then
    local kind = d.classes:includes("pin") and "pin" or "cover"
    local classes = pandoc.List({ kind })
    for _, c in ipairs(d.classes) do if c ~= kind then classes:insert(c) end end
    local attrs = {}
    for k, v in pairs(d.attributes) do
      if k == "side" or k == "tone" or k == "width" or k == "align" then
        classes:insert(k .. "-" .. v)
      else
        attrs[k] = v
      end
    end
    d.classes = classes
    d.attributes = attrs
  end
  return d
end

return {
  { Meta = Meta },
  { Header = Header, Div = Div },
}
