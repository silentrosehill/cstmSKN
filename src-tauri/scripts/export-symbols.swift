import AppKit
import Foundation

// Generate navigation/control assets from the system SF Symbols library.
// These assets are for Apple-platform UI, never the app's icon or logo.
let output = CommandLine.arguments[1]
let symbols = [
    "mods":"puzzlepiece.extension", "loadouts":"slider.horizontal.3", "voice":"waveform", "map":"map", "announcer":"mic", "other":"square.on.circle",
    "new":"sparkles", "grid":"square.grid.2x2", "library":"square.stack.3d.up", "custom":"shippingbox",
    "enabled":"checkmark.circle", "settings":"slider.horizontal.3", "sidebar":"sidebar.left",
    "sort":"arrow.up.arrow.down", "chevron-down":"chevron.down", "star":"star",
    "compact":"rectangle.grid.3x2", "expand":"arrow.up.left.and.arrow.down.right", "close":"xmark",
    "moon":"moon", "sun":"sun.max", "search":"magnifyingglass", "back":"chevron.left",
    "next":"chevron.right", "download":"arrow.down.to.line", "check":"checkmark",
    "play":"play.fill", "stop":"stop.fill"
]
try FileManager.default.createDirectory(atPath: output, withIntermediateDirectories: true)
for (key, name) in symbols.sorted(by: {$0.key < $1.key}) {
    guard let original = NSImage(systemSymbolName:name, accessibilityDescription:nil),
          let symbol = original.withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize:24,weight:.regular)),
          let bitmap = NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:72,pixelsHigh:72,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0),
          let context = NSGraphicsContext(bitmapImageRep:bitmap) else { fatalError("Missing symbol: \(name)") }
    bitmap.size = NSSize(width:72,height:72)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    NSColor.clear.setFill(); NSRect(x:0,y:0,width:72,height:72).fill()
    let scale = min(59/symbol.size.width,59/symbol.size.height)
    let size = NSSize(width:symbol.size.width*scale,height:symbol.size.height*scale)
    symbol.draw(in:NSRect(x:(72-size.width)/2,y:(72-size.height)/2,width:size.width,height:size.height),from:.zero,operation:.sourceOver,fraction:1)
    NSGraphicsContext.restoreGraphicsState()
    guard let png=bitmap.representation(using:.png,properties:[:]) else {fatalError("PNG failed")}
    try png.write(to:URL(fileURLWithPath:output).appendingPathComponent("\(key).png"))
}
print("Exported \(symbols.count) system SF Symbols")
