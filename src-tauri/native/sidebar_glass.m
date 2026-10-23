#import <AppKit/AppKit.h>
#import <objc/runtime.h>
#import <math.h>

// Resolve glass at runtime to retain the older-macOS vibrancy fallback.
// The webview stays above this native surface and keeps all of its input bounds.
@protocol CSTMGlassProperties <NSObject>
- (void)setCornerRadius:(CGFloat)radius;
- (void)setTintColor:(NSColor *)color;
- (void)setStyle:(NSInteger)style;
- (void)setContentView:(NSView *)view;
- (NSView *)contentView;
@end

@protocol CSTMTransparentWebProperties <NSObject>
- (void)setUnderPageBackgroundColor:(NSColor *)color;
@end

static char CSTMGlassKey;

static NSImage *cstm_rounded_material_mask(CGFloat radius) {
    NSImage *image = [[NSImage alloc] initWithSize:NSMakeSize(radius * 2 + 2, radius * 2 + 2)];
    [image lockFocus];
    [[NSColor blackColor] setFill];
    [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(0, 0, image.size.width, image.size.height)
                                   xRadius:radius yRadius:radius] fill];
    [image unlockFocus];
    image.capInsets = NSEdgeInsetsMake(radius, radius, radius, radius);
    image.resizingMode = NSImageResizingModeStretch;
    return image;
}

static NSView *cstm_make_sidebar_material(Class glassClass) {
    if (glassClass) {
        NSView *glass = [[glassClass alloc] initWithFrame:NSZeroRect];
        if ([glass respondsToSelector:@selector(setContentView:)] &&
            [glass respondsToSelector:@selector(setCornerRadius:)] &&
            [glass respondsToSelector:@selector(setTintColor:)] &&
            [glass respondsToSelector:@selector(setStyle:)]) {
            // NSGlassEffectViewStyleClear = 1, verified against the AppKit SDK.
            // Regular glass plus a second vibrancy backing creates a milky plate.
            [(id<CSTMGlassProperties>)glass setStyle:1];
            [(id<CSTMGlassProperties>)glass setTintColor:nil];
            [(id<CSTMGlassProperties>)glass setCornerRadius:22.0];
            NSView *content = [[NSView alloc] initWithFrame:NSZeroRect];
            content.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
            [(id<CSTMGlassProperties>)glass setContentView:content];
            glass.identifier = @"cstm.sidebar.clear-glass";
            return glass;
        }
    }
    // Older macOS uses one localized, behind-window material. The background
    // comes from the desktop and other windows, rather than app artwork.
    NSVisualEffectView *effect = [[NSVisualEffectView alloc] initWithFrame:NSZeroRect];
    effect.blendingMode = NSVisualEffectBlendingModeBehindWindow;
    effect.material = NSVisualEffectMaterialHUDWindow;
    effect.state = NSVisualEffectStateActive;
    effect.emphasized = NO;
    effect.maskImage = cstm_rounded_material_mask(22.0);
    effect.identifier = @"cstm.sidebar.desktop-vibrancy";
    return effect;
}

int cstm_set_sidebar_glass(void *rawWindow, double sidebarWidth) {
    if (![NSThread isMainThread] || !rawWindow || !isfinite(sidebarWidth)) return 0;
    NSWindow *window = (__bridge NSWindow *)rawWindow;
    NSView *root = window.contentView;
    if (!root) return 0;
    NSView *material = objc_getAssociatedObject(root, &CSTMGlassKey);
    if (!material) {
        NSView *webView = nil;
        Class webClass = NSClassFromString(@"WKWebView");
        for (NSView *candidate in root.subviews) {
            if (webClass && [candidate isKindOfClass:webClass]) { webView = candidate; break; }
        }
        if (!webView) return 0;
        material = cstm_make_sidebar_material(NSClassFromString(@"NSGlassEffectView"));
        material.autoresizingMask = NSViewHeightSizable;
        [root addSubview:material positioned:NSWindowBelow relativeTo:webView];
        objc_setAssociatedObject(root, &CSTMGlassKey, material, OBJC_ASSOCIATION_RETAIN_NONATOMIC);

        // Every layer between native glass and the desktop must stay clear.
        // Tauri already makes WKWebView transparent via `transparent: true`.
        window.opaque = NO;
        window.backgroundColor = [NSColor clearColor];
        root.layer.backgroundColor = [NSColor clearColor].CGColor;
        webView.layer.backgroundColor = [NSColor clearColor].CGColor;
        if ([webView respondsToSelector:@selector(setUnderPageBackgroundColor:)]) {
            [(id<CSTMTransparentWebProperties>)webView setUnderPageBackgroundColor:[NSColor clearColor]];
        }
    }
    CGFloat width = fmin(fmax(sidebarWidth, 68.0), fmin(340.0, NSWidth(root.bounds)));
    material.frame = NSMakeRect(8.0, 8.0, fmax(0.0, width - 16.0), fmax(0.0, NSHeight(root.bounds) - 16.0));
    if ([material respondsToSelector:@selector(contentView)]) {
        [(id<CSTMGlassProperties>)material contentView].frame = material.bounds;
    }
    return 1;
}
