#import <AppKit/AppKit.h>
#import <objc/runtime.h>
#import <math.h>

// Use a runtime lookup so the same bundle keeps sidebar vibrancy on older macOS.
// No new AppKit class is strongly linked into the 10.15-compatible executable.
@protocol CSTMGlassProperties <NSObject>
- (void)setCornerRadius:(CGFloat)radius;
- (void)setTintColor:(NSColor *)color;
- (void)setStyle:(NSInteger)style;
- (void)setContentView:(NSView *)view;
- (NSView *)contentView;
@end

static char CSTMGlassKey;

int cstm_set_sidebar_glass(void *rawWindow, double sidebarWidth) {
    if (![NSThread isMainThread] || !rawWindow || !isfinite(sidebarWidth)) return 0;
    Class glassClass = NSClassFromString(@"NSGlassEffectView");
    if (!glassClass) return 0;
    NSWindow *window = (__bridge NSWindow *)rawWindow;
    NSView *root = window.contentView;
    if (!root) return 0;
    NSView *glass = objc_getAssociatedObject(root, &CSTMGlassKey);
    if (!glass) {
        NSView *webView = nil;
        Class webClass = NSClassFromString(@"WKWebView");
        for (NSView *candidate in root.subviews) {
            if (webClass && [candidate isKindOfClass:webClass]) { webView = candidate; break; }
        }
        // The WKWebView remains the full-window input surface above this backing.
        if (!webView) return 0;
        glass = [[glassClass alloc] initWithFrame:NSZeroRect];
        if (![glass respondsToSelector:@selector(setContentView:)] ||
            ![glass respondsToSelector:@selector(setCornerRadius:)] ||
            ![glass respondsToSelector:@selector(setTintColor:)] ||
            ![glass respondsToSelector:@selector(setStyle:)]) return 0;
        [(id<CSTMGlassProperties>)glass setStyle:0]; // AppKit regular Liquid Glass.
        [(id<CSTMGlassProperties>)glass setTintColor:nil];
        [(id<CSTMGlassProperties>)glass setCornerRadius:22.0];
        NSView *content = [[NSView alloc] initWithFrame:NSZeroRect];
        content.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        [(id<CSTMGlassProperties>)glass setContentView:content];
        glass.autoresizingMask = NSViewHeightSizable;
        [root addSubview:glass positioned:NSWindowBelow relativeTo:webView];
        objc_setAssociatedObject(root, &CSTMGlassKey, glass, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    CGFloat width = fmin(fmax(sidebarWidth, 68.0), fmin(340.0, NSWidth(root.bounds)));
    glass.frame = NSMakeRect(8.0, 8.0, fmax(0.0, width - 16.0), fmax(0.0, NSHeight(root.bounds) - 16.0));
    [(id<CSTMGlassProperties>)glass contentView].frame = glass.bounds;
    return 1;
}
