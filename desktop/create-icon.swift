import AppKit
import Foundation
let path=CommandLine.arguments[1]
let image=NSImage(size:NSSize(width:1024,height:1024))
image.lockFocus()
NSColor(calibratedRed:0.055,green:0.08,blue:0.045,alpha:1).setFill()
NSBezierPath(roundedRect:NSRect(x:28,y:28,width:968,height:968),xRadius:222,yRadius:222).fill()
let panel=NSBezierPath(roundedRect:NSRect(x:60,y:60,width:904,height:904),xRadius:197,yRadius:197)
NSGradient(starting:NSColor(calibratedRed:0.82,green:1,blue:0.56,alpha:1),ending:NSColor(calibratedRed:0.59,green:0.82,blue:0.34,alpha:1))!.draw(in:panel,angle:-45)
let face=NSBezierPath();let points:[NSPoint]=[.init(x:150,y:735),.init(x:365,y:629),.init(x:512,y:846),.init(x:659,y:629),.init(x:874,y:735),.init(x:785,y:292),.init(x:512,y:137),.init(x:239,y:292)]
face.move(to:points[0]);for p in points.dropFirst(){face.line(to:p)};face.close();NSColor(calibratedRed:0.09,green:0.14,blue:0.065,alpha:1).setFill();face.fill()
NSColor(calibratedRed:0.77,green:0.98,blue:0.47,alpha:1).setFill()
for eye in [[NSPoint(x:320,y:520),NSPoint(x:450,y:474),NSPoint(x:430,y:422),NSPoint(x:333,y:455)],[NSPoint(x:704,y:520),NSPoint(x:574,y:474),NSPoint(x:594,y:422),NSPoint(x:691,y:455)]]{let p=NSBezierPath();p.move(to:eye[0]);for point in eye.dropFirst(){p.line(to:point)};p.close();p.fill()}
image.unlockFocus()
let rep=NSBitmapImageRep(data:image.tiffRepresentation!)!
try rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:path))
