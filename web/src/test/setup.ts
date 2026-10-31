import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Pages load data in effects; give slow machines room before findBy* gives up.
configure({ asyncUtilTimeout: 5000 });
afterEach(() => cleanup());
