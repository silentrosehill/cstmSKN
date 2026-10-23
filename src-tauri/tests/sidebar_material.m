#import <WebKit/WebKit.h>
#import "../native/sidebar_glass.m"
#include <assert.h>

// Structural AppKit regression checks. The window is never ordered on screen;
// these checks neither capture nor interact with the user's windows/desktop.
int main(void) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyProhibited];
        NSView *fallback = cstm_make_sidebar_material(Nil);
        assert([fallback isKindOfClass:NSVisualEffectView.class]);
        NSVisualEffectView *vibrancy = (NSVisualEffectView *)fallback;
        assert(vibrancy.blendingMode == NSVisualEffectBlendingModeBehindWindow);
        assert(vibrancy.material == NSVisualEffectMaterialHUDWindow);
        assert(vibrancy.state == NSVisualEffectStateActive);
        assert(vibrancy.maskImage != nil);
        assert(vibrancy.maskImage.capInsets.left == 22.0);
        assert([cstm_make_sidebar_material(NSView.class) isKindOfClass:NSVisualEffectView.class]);

        NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 1100, 760)
                                                    styleMask:NSWindowStyleMaskTitled
                                                      backing:NSBackingStoreBuffered defer:NO];
        window.releasedWhenClosed = NO;
        NSView *root = window.contentView;
        WKWebView *web = [[WKWebView alloc] initWithFrame:root.bounds];
        web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        [root addSubview:web];
        NSRect originalWebFrame = web.frame;
        void *rawWindow = (__bridge void *)window;
        assert(cstm_set_sidebar_glass(rawWindow, 224) == 1);
        assert(!window.opaque);
        assert(window.backgroundColor.alphaComponent == 0.0);
        assert(root.subviews.count == 2);
        NSView *material = root.subviews[0];
        assert(root.subviews[1] == web);
        assert(web.superview == root);
        assert(NSEqualRects(web.frame, originalWebFrame));
        assert(material.frame.origin.x == 8.0 && material.frame.origin.y == 8.0);
        assert(NSWidth(material.frame) == 208.0);
        assert(NSHeight(material.frame) == NSHeight(root.bounds) - 16.0);
        if (NSClassFromString(@"NSGlassEffectView")) {
            assert([material isKindOfClass:NSClassFromString(@"NSGlassEffectView")]);
            assert([[material valueForKey:@"style"] integerValue] == 1);
            assert([material valueForKey:@"tintColor"] == nil);
            assert(NSEqualRects([(id<CSTMGlassProperties>)material contentView].frame, material.bounds));
        }
        assert(cstm_set_sidebar_glass(rawWindow, 68) == 1);
        assert(NSWidth(material.frame) == 52.0);
        assert(root.subviews.count == 2);
        assert(cstm_set_sidebar_glass(rawWindow, 999) == 1);
        assert(NSWidth(material.frame) == 324.0);
        assert(cstm_set_sidebar_glass(rawWindow, NAN) == 0);
        assert(cstm_set_sidebar_glass(NULL, 224) == 0);
        assert(root.subviews.count == 2);
        assert(web.superview == root && NSEqualRects(web.frame, originalWebFrame));
        NSSize resized = NSMakeSize(1000, 700);
        [window setContentSize:resized];
        assert(cstm_set_sidebar_glass(rawWindow, 260) == 1);
        assert(NSHeight(material.frame) == NSHeight(root.bounds) - 16.0);
        assert(NSWidth(material.frame) == 244.0);
        assert(web.superview == root && NSEqualRects(web.frame, root.bounds));
        [window close];
        puts("Native sidebar material checks passed: clear glass, desktop vibrancy fallback, transparent window, input bounds, resize, no duplicate surfaces.");
    }
    return 0;
}
