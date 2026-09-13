import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 m-4 bg-rose-50/90 border border-rose-200 rounded-2xl text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 mx-auto flex items-center justify-center">
            <AlertTriangle size={24} />
          </div>
          <h3 className="text-sm font-bold text-rose-900">
            {this.props.fallbackTitle || 'حدث خطأ غير متوقع أثناء عرض هذا القسم'}
          </h3>
          <p className="text-xs text-rose-700 max-w-sm mx-auto leading-relaxed">
            تم تفادي إغلاق الشاشة للحفاظ على بياناتك. يمكنك المحاولة مجدداً أو العودة للسلة.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-2 cursor-pointer shadow-xs transition-all"
          >
            <RefreshCw size={14} />
            <span>إعادة المحاولة / العودة للسلة</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
